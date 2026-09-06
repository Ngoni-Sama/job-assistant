import type { CheckType } from "../types";

/** Verification/background-check catalog. Priced in credits. */
export const CHECKS: CheckType[] = [
  {
    id: "identity",
    name: "Identity Verification",
    category: "Identity",
    credits: 15,
    description: "Confirm your national ID / passport.",
  },
  {
    id: "education",
    name: "Education Verification",
    category: "Education",
    credits: 20,
    description: "Verify your highest qualification.",
  },
  {
    id: "employment",
    name: "Employment History",
    category: "Employment",
    credits: 20,
    description: "Confirm your past employers and roles.",
  },
  {
    id: "police",
    name: "Police Clearance",
    category: "Background",
    credits: 30,
    description: "Criminal background / police clearance check.",
  },
];

export function findCheck(id: string): CheckType | undefined {
  return CHECKS.find((c) => c.id === id);
}
