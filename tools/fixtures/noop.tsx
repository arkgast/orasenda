// Seeded for the no-op class test; the scan skips this folder. font-bold and m-9 (the scale stops at space-8) emit no CSS in the closed theme.
export const bad = <div className={cn("group font-bold m-9", "p-4")} />;
