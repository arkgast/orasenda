//! The five starter routines, kept as data. Adding one copies it into an ordinary routine; the
//! copy keeps the template's id only to show its wellness note.

use serde::{Deserialize, Serialize};
use specta::Type;

use super::Weekdays;

const NOT_ADVICE: &str = "Wellness suggestion, not medical advice.";

/// Which template a routine was copied from. Stored as its camelCase text (`as_str`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TemplateId {
    MorningLight,
    DeepWorkStart,
    StudySession,
    EveningShutdown,
    WindDown,
}

impl TemplateId {
    /// The stored text: "morningLight". The same as the IPC form.
    pub fn as_str(self) -> &'static str {
        match self {
            TemplateId::MorningLight => "morningLight",
            TemplateId::DeepWorkStart => "deepWorkStart",
            TemplateId::StudySession => "studySession",
            TemplateId::EveningShutdown => "eveningShutdown",
            TemplateId::WindDown => "windDown",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        all().iter().map(|t| t.id).find(|id| id.as_str() == text)
    }
}

/// One step of a template; it becomes a habit in the copied routine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TemplateStep {
    pub name: &'static str,
    /// The 2-minute version, worded to follow "2-minute version: ".
    pub two_minute: Option<&'static str>,
    /// Left empty in every template: the person writes their own.
    pub identity: Option<&'static str>,
    pub anchor: Option<&'static str>,
    /// An evidence note shown with the step: "The evidence is contested."
    pub detail: Option<&'static str>,
    pub optional: bool,
}

/// A starter routine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Template {
    pub id: TemplateId,
    pub name: &'static str,
    /// Minutes after local midnight; `None` is *Any time*.
    pub time_of_day: Option<u16>,
    pub days: Weekdays,
    pub summary: &'static str,
    pub steps: &'static [TemplateStep],
    /// Every template is a wellness suggestion and shows `note`.
    pub wellness: bool,
    /// The wellness note: "Wellness suggestion, not medical advice."
    pub note: &'static str,
}

const fn step(name: &'static str) -> TemplateStep {
    TemplateStep {
        name,
        two_minute: None,
        identity: None,
        anchor: None,
        detail: None,
        optional: false,
    }
}

const fn small(name: &'static str, two_minute: &'static str) -> TemplateStep {
    TemplateStep {
        two_minute: Some(two_minute),
        ..step(name)
    }
}

const fn optional(name: &'static str, detail: Option<&'static str>) -> TemplateStep {
    TemplateStep {
        detail,
        optional: true,
        ..step(name)
    }
}

const MORNING_LIGHT: [TemplateStep; 7] = [
    small("Drink a glass of water", "one sip"),
    small(
        "Get outdoor light: 5–10 min, 15–20 if overcast, 30+ if heavily overcast",
        "step outside the door",
    ),
    small("Move for 5–10 minutes", "ten squats"),
    small("Set the Frog and 3 priorities", "write the Frog"),
    optional(
        "Delay caffeine 90–120 minutes",
        Some("The evidence is contested."),
    ),
    optional("Electrolytes", None),
    optional("Visual focus drill, 30–60 seconds", Some("Weak evidence.")),
];

const DEEP_WORK_START: [TemplateStep; 5] = [
    step("Clear the desk"),
    step("Put the phone in another room"),
    step("Close chat"),
    step("Write what this block is for"),
    TemplateStep {
        detail: Some("Orasenda's blocking comes later."),
        ..step("Turn on your blocker or Do Not Disturb")
    },
];

const STUDY_SESSION: [TemplateStep; 3] = [
    step("Test yourself: recall before you re-read"),
    optional("Brief rest between rounds", None),
    optional(
        "NSDR afterwards",
        Some("Non-sleep deep rest. Experimental."),
    ),
];

const EVENING_SHUTDOWN: [TemplateStep; 4] = [
    step("Move unfinished tasks"),
    step("Preview tomorrow"),
    step("Reflect: what went well, what to improve, what was outside your control"),
    step("Say \"Shutdown complete\""),
];

const WIND_DOWN: [TemplateStep; 2] = [
    step("Dim the lights and avoid bright overhead light"),
    step("Set a no-screens cutoff"),
];

static TEMPLATES: [Template; 5] = [
    Template {
        id: TemplateId::MorningLight,
        name: "Morning Light & Movement",
        time_of_day: Some(7 * 60),
        days: Weekdays::EVERY_DAY,
        summary: "Water, daylight and movement to start the day.",
        steps: &MORNING_LIGHT,
        wellness: true,
        note: "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
    },
    Template {
        id: TemplateId::DeepWorkStart,
        name: "Deep Work Start",
        time_of_day: Some(9 * 60),
        days: Weekdays::WEEKDAYS,
        summary: "Clear the way before deep work.",
        steps: &DEEP_WORK_START,
        wellness: true,
        note: NOT_ADVICE,
    },
    Template {
        id: TemplateId::StudySession,
        name: "Study Session",
        time_of_day: None,
        days: Weekdays::WEEKDAYS,
        summary: "Learn by recalling, not re-reading.",
        steps: &STUDY_SESSION,
        wellness: true,
        note: NOT_ADVICE,
    },
    Template {
        id: TemplateId::EveningShutdown,
        name: "Evening Shutdown",
        time_of_day: Some(17 * 60 + 30),
        days: Weekdays::WEEKDAYS,
        summary: "Close the workday on purpose.",
        steps: &EVENING_SHUTDOWN,
        wellness: true,
        note: NOT_ADVICE,
    },
    Template {
        id: TemplateId::WindDown,
        name: "Wind-down",
        time_of_day: Some(21 * 60 + 30),
        days: Weekdays::EVERY_DAY,
        summary: "Dim the evening and set a screen cutoff.",
        steps: &WIND_DOWN,
        wellness: true,
        note: NOT_ADVICE,
    },
];

/// The five templates, in the order the template dialog lists them.
pub fn all() -> &'static [Template] {
    &TEMPLATES
}

/// One template by id.
pub fn get(id: TemplateId) -> &'static Template {
    // Every id has exactly one entry, in declaration order.
    &TEMPLATES[id as usize]
}
