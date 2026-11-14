import type { TemplateView_Serialize } from "../../ipc/bindings";

// Kept apart from routines.ts (no testing-library import) so the layout scenarios can use it.
/** The five templates as `routine_templates` answers them on a 24-hour clock. */
export const TEMPLATES: TemplateView_Serialize[] = [
  {
    id: "morningLight",
    name: "Morning Light & Movement",
    summary: "Water, daylight and movement to start the day.",
    time: "07:00",
    steps: [
      "Drink a glass of water",
      "Get outdoor light: 5–10 min, 15–20 if overcast, 30+ if heavily overcast",
      "Move for 5–10 minutes",
      "Set the Frog and 3 priorities",
      "Delay caffeine 90–120 minutes (optional). The evidence is contested.",
      "Electrolytes (optional)",
      "Visual focus drill, 30–60 seconds (optional). Weak evidence.",
    ],
    note: "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
  },
  {
    id: "deepWorkStart",
    name: "Deep Work Start",
    summary: "Clear the way before deep work.",
    time: "09:00",
    steps: [
      "Clear the desk",
      "Put the phone in another room",
      "Close chat",
      "Write what this block is for",
      "Turn on your blocker or Do Not Disturb. Orasenda's blocking comes later.",
    ],
    note: "Wellness suggestion, not medical advice.",
  },
  {
    id: "studySession",
    name: "Study Session",
    summary: "Learn by recalling, not re-reading.",
    time: null,
    steps: [
      "Test yourself: recall before you re-read",
      "Brief rest between rounds (optional)",
      "NSDR afterwards (optional). Non-sleep deep rest. Experimental.",
    ],
    note: "Wellness suggestion, not medical advice.",
  },
  {
    id: "eveningShutdown",
    name: "Evening Shutdown",
    summary: "Close the workday on purpose.",
    time: "17:30",
    steps: [
      "Move unfinished tasks",
      "Preview tomorrow",
      "Reflect: what went well, what to improve, what was outside your control",
      'Say "Shutdown complete"',
    ],
    note: "Wellness suggestion, not medical advice.",
  },
  {
    id: "windDown",
    name: "Wind-down",
    summary: "Dim the evening and set a screen cutoff.",
    time: "21:30",
    steps: ["Dim the lights and avoid bright overhead light", "Set a no-screens cutoff"],
    note: "Wellness suggestion, not medical advice.",
  },
];
