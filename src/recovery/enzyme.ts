export type EnzymeAction = "CREATE" | "DESTROY" | "BUILD" | "BREAK" | "REPAIR" | "RENEW";
export function enzymeRecover(_action: EnzymeAction, state: "healthy" | "broken" | "uncertain"): EnzymeAction {
  if (state === "healthy") return "CREATE";
  if (state === "broken") return "BUILD";
  if (state === "uncertain") return "REPAIR";
  return "RENEW";
}
