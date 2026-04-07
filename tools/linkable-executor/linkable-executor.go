// ============================================================================
// linkable-executor.go
// Drag-and-Drop Entry Point for OBINexus LTF System
//
// Usage (Windows drag-drop):
//   Drag any file onto linkable-executor.exe → auto-detects type → routes to handler
//
// Usage (manual):
//   ./linkable-executor <file-path> [--cisc|--risc]
//
// Flow:
//   [dropped file] → [read magic bytes] → [detect CISC/RISC] → [invoke handler]
// ============================================================================

package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

const (
	MAGIC_ZIP    = "PK\x03\x04"           // ZIP archive (main.go DOP adapter)
	MAGIC_NSIGII = "NSIGII"               // NSIGII video codec (decode.py)
	MAGIC_ELF    = "\x7FELF"              // ELF binary (ropen or compiled artifact)
	MAGIC_MACH64 = "\xFE\xED\xFA\xCF"     // Mach-O 64-bit (macOS)
	MAGIC_PE     = "MZ"                   // PE executable (Windows .exe/.dll)
)

type FileType int

const (
	FILETYPE_UNKNOWN FileType = iota
	FILETYPE_ZIP              // UI/UX components → main.go
	FILETYPE_NSIGII           // Video codec → decode.py
	FILETYPE_ROPEN            // Sparse duplex encoded → ropen.exe
	FILETYPE_ELF              // ELF binary → execute directly
	FILETYPE_PE               // Windows PE → execute directly
	FILETYPE_MACH             // Mach-O binary → execute directly
)

func (ft FileType) String() string {
	switch ft {
	case FILETYPE_ZIP:
		return "ZIP (DOP Adapter)"
	case FILETYPE_NSIGII:
		return "NSIGII (Video Codec)"
	case FILETYPE_ROPEN:
		return "ROPEN (Sparse Duplex)"
	case FILETYPE_ELF:
		return "ELF Binary"
	case FILETYPE_PE:
		return "PE Executable"
	case FILETYPE_MACH:
		return "Mach-O Binary"
	default:
		return "Unknown"
	}
}

// ============================================================================
// INSTRUCTION SET DETECTION
// ============================================================================

type ISA int

const (
	ISA_UNKNOWN ISA = iota
	ISA_CISC           // Complex Instruction Set (x86, x86-64)
	ISA_RISC           // Reduced Instruction Set (ARM, MIPS, RISC-V)
)

func (isa ISA) String() string {
	switch isa {
	case ISA_CISC:
		return "CISC"
	case ISA_RISC:
		return "RISC"
	default:
		return "UNKNOWN"
	}
}

// ============================================================================
// MAGIC BYTE DETECTION
// ============================================================================

func detectFileType(filePath string) (FileType, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return FILETYPE_UNKNOWN, err
	}
	defer f.Close()

	magic := make([]byte, 16)
	n, err := f.Read(magic)
	if err != nil && err != io.EOF {
		return FILETYPE_UNKNOWN, err
	}
	magic = magic[:n]

	// ZIP (PK signature)
	if bytes.HasPrefix(magic, []byte(MAGIC_ZIP)) {
		return FILETYPE_ZIP, nil
	}

	// NSIGII (magic + version)
	if bytes.HasPrefix(magic, []byte(MAGIC_NSIGII)) {
		return FILETYPE_NSIGII, nil
	}

	// ELF binary
	if bytes.HasPrefix(magic, []byte(MAGIC_ELF)) {
		return FILETYPE_ELF, nil
	}

	// Mach-O 64-bit
	if bytes.HasPrefix(magic, []byte(MAGIC_MACH64)) {
		return FILETYPE_MACH, nil
	}

	// PE executable (Windows)
	if bytes.HasPrefix(magic, []byte(MAGIC_PE)) {
		return FILETYPE_PE, nil
	}

	// If it looks like sparse duplex (binary but not recognized above)
	// You can add heuristic detection for ROPEN here
	if !isText(magic) {
		return FILETYPE_ROPEN, nil
	}

	return FILETYPE_UNKNOWN, nil
}

func isText(data []byte) bool {
	for _, b := range data {
		if b < 0x20 && b != '\t' && b != '\n' && b != '\r' {
			return false
		}
	}
	return true
}

// ============================================================================
// INSTRUCTION SET DETECTION (ELF/Mach-O/PE)
// ============================================================================

func detectISA(filePath string, fileType FileType) (ISA, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return ISA_UNKNOWN, err
	}
	defer f.Close()

	switch fileType {
	case FILETYPE_ELF:
		return detectISA_ELF(f)
	case FILETYPE_MACH:
		return detectISA_MachO(f)
	case FILETYPE_PE:
		return detectISA_PE(f)
	default:
		return ISA_UNKNOWN, fmt.Errorf("cannot detect ISA for file type %s", fileType)
	}
}

// ELF machine type (offset 0x12)
func detectISA_ELF(f *os.File) (ISA, error) {
	f.Seek(0x12, 0)
	var machineType uint16
	if err := binary.Read(f, binary.LittleEndian, &machineType); err != nil {
		return ISA_UNKNOWN, err
	}

	// EM_386 (3), EM_X86_64 (62) = CISC
	// EM_ARM (40), EM_AARCH64 (183) = RISC
	switch machineType {
	case 3, 62:
		return ISA_CISC, nil
	case 40, 183:
		return ISA_RISC, nil
	default:
		return ISA_UNKNOWN, nil
	}
}

// Mach-O cpu type (offset 0x04)
func detectISA_MachO(f *os.File) (ISA, error) {
	f.Seek(0x04, 0)
	var cpuType uint32
	if err := binary.Read(f, binary.LittleEndian, &cpuType); err != nil {
		return ISA_UNKNOWN, err
	}

	// CPU_TYPE_X86 (7), CPU_TYPE_X86_64 (7, 0x01000007) = CISC
	// CPU_TYPE_ARM (12), CPU_TYPE_ARM64 (0x0100000c) = RISC
	switch cpuType {
	case 7, 0x01000007:
		return ISA_CISC, nil
	case 12, 0x0100000c:
		return ISA_RISC, nil
	default:
		return ISA_UNKNOWN, nil
	}
}

// PE machine type (offset 0x3C + 0x04)
func detectISA_PE(f *os.File) (ISA, error) {
	// Read PE header offset
	f.Seek(0x3C, 0)
	var peOffset int32
	if err := binary.Read(f, binary.LittleEndian, &peOffset); err != nil {
		return ISA_UNKNOWN, err
	}

	// Machine type at offset peOffset + 0x04
	f.Seek(int64(peOffset+0x04), 0)
	var machineType uint16
	if err := binary.Read(f, binary.LittleEndian, &machineType); err != nil {
		return ISA_UNKNOWN, err
	}

	// 0x014c (IMAGE_FILE_MACHINE_I386) = CISC
	// 0x8664 (IMAGE_FILE_MACHINE_AMD64) = CISC
	// 0xAA64 (IMAGE_FILE_MACHINE_ARM64) = RISC
	switch machineType {
	case 0x014c, 0x8664:
		return ISA_CISC, nil
	case 0xAA64:
		return ISA_RISC, nil
	default:
		return ISA_UNKNOWN, nil
	}
}

// ============================================================================
// HANDLER ROUTING
// ============================================================================

// Handler is a function that processes a dropped file
type Handler func(filePath string, isa ISA) error

// Route file to the correct handler based on type and ISA
func routeFile(filePath string, fileType FileType, isa ISA) error {
	fmt.Printf("\n╔════════════════════════════════════════════════════╗\n")
	fmt.Printf("║  OBINexus Linkable Executor                        ║\n")
	fmt.Printf("╠════════════════════════════════════════════════════╣\n")
	fmt.Printf("║  File:     %-44s║\n", filepath.Base(filePath))
	fmt.Printf("║  Type:     %-44s║\n", fileType.String())
	if isa != ISA_UNKNOWN {
		fmt.Printf("║  ISA:      %-44s║\n", isa.String())
	}
	fmt.Printf("╚════════════════════════════════════════════════════╝\n\n")

	var handler Handler

	switch fileType {
	case FILETYPE_ZIP:
		handler = handleZIP
	case FILETYPE_NSIGII:
		handler = handleNSIGII
	case FILETYPE_ROPEN:
		handler = handleROPEN
	case FILETYPE_ELF, FILETYPE_PE, FILETYPE_MACH:
		handler = handleBinary
	default:
		return fmt.Errorf("unsupported file type: %s", fileType)
	}

	return handler(filePath, isa)
}

// ============================================================================
// HANDLERS
// ============================================================================

// Handle ZIP → invoke main.go DOP adapter
func handleZIP(filePath string, isa ISA) error {
	fmt.Printf("[ZIP] Invoking DOP Adapter...\n")
	fmt.Printf("[ZIP] File: %s\n", filePath)

	cmd := exec.Command("go", "run", "main.go", "--zip", filePath, "--mode", "both")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("DOP adapter failed: %w", err)
	}

	fmt.Printf("[ZIP] ✓ Completed\n")
	return nil
}

// Handle NSIGII → invoke decode.py
func handleNSIGII(filePath string, isa ISA) error {
	fmt.Printf("[NSIGII] Invoking Video Decoder...\n")
	fmt.Printf("[NSIGII] File: %s\n", filePath)

	cmd := exec.Command("python", "decode.py", filePath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("NSIGII decoder failed: %w", err)
	}

	fmt.Printf("[NSIGII] ✓ Frames decoded to ./decoded/\n")
	return nil
}

// Handle ROPEN → invoke ropen.exe/ropen.so with polarity based on ISA
func handleROPEN(filePath string, isa ISA) error {
	fmt.Printf("[ROPEN] Invoking Sparse Duplex Encoder...\n")
	fmt.Printf("[ROPEN] File: %s\n", filePath)

	// Route CISC → polarity A, RISC → polarity B
	polarity := "A"
	if isa == ISA_RISC {
		polarity = "B"
	}

	var executable string
	exeDir, err := filepath.Abs(filepath.Dir(os.Args[0]))
	if err != nil {
	    exeDir = "."
	}
	if runtime.GOOS == "windows" {
	    executable = filepath.Join(exeDir, "ropen.exe")
	} else {
	    executable = filepath.Join(exeDir, "ropen.so")
	}
	
	cmd := exec.Command(executable, filePath, polarity)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ROPEN encoder failed: %w", err)
	}

	fmt.Printf("[ROPEN] ✓ Encoded with polarity %s\n", polarity)
	return nil
}

// Handle binary (ELF/PE/Mach-O) → execute directly
func handleBinary(filePath string, isa ISA) error {
	fmt.Printf("[BINARY] Executing linkable...\n")
	fmt.Printf("[BINARY] File: %s\n", filePath)
	fmt.Printf("[BINARY] ISA: %s\n", isa)

	cmd := exec.Command(filePath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("binary execution failed: %w", err)
	}

	fmt.Printf("[BINARY] ✓ Execution completed\n")
	return nil
}

// ============================================================================
// MAIN
// ============================================================================

func main() {
	// CLI flags
	flag.Parse()
	args := flag.Args()

	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, `
OBINexus Linkable Executor — Drag-and-Drop Entry Point

USAGE:
  linkable-executor <file-path> [--cisc|--risc]
  (or drag file onto linkable-executor.exe on Windows)

SUPPORTS:
  • .zip archives (DOP Adapter)
  • .nsigii video (Video Decoder)
  • .ropen sparse duplex (Duplex Encoder)
  • ELF/PE/Mach-O binaries (Direct execution)

EXAMPLES:
  linkable-executor component.zip
  linkable-executor video.nsigii
  linkable-executor artifact.ropen --cisc

`)
		os.Exit(1)
	}

	filePath := args[0]

	// Stat file
	info, err := os.Stat(filePath)
	if err != nil {
		log.Fatalf("File not found: %s", filePath)
	}

	if !info.Mode().IsRegular() {
		log.Fatalf("Not a regular file: %s", filePath)
	}

	// Detect file type
	fileType, err := detectFileType(filePath)
	if err != nil {
		log.Fatalf("Failed to detect file type: %v", err)
	}

	// Detect ISA if applicable
	isa := ISA_UNKNOWN
	if fileType == FILETYPE_ELF || fileType == FILETYPE_PE || fileType == FILETYPE_MACH {
		isa, _ = detectISA(filePath, fileType)
	}

	// Override with CLI flags
	for _, arg := range args[1:] {
		if arg == "--cisc" {
			isa = ISA_CISC
		} else if arg == "--risc" {
			isa = ISA_RISC
		}
	}

	// Route and execute
	start := time.Now()
	if err := routeFile(filePath, fileType, isa); err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] %v\n", err)
		os.Exit(1)
	}

	elapsed := time.Since(start)
	fmt.Printf("\n[COMPLETE] Execution time: %s\n", elapsed)
}
