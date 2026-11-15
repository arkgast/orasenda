//! Fitting.
use crate::api::TaskPriority;
use crate::import::item::RawItem;
#[derive(Debug, Clone)]
pub(crate) struct FittedTask { pub origin: String, pub title: String, pub notes: String, pub tags: Vec<String>, pub priority: Option<TaskPriority>, pub due: Option<String>, pub checklist: Vec<String> }
#[derive(Debug, Clone)]
pub(crate) struct Fitted { pub task: Option<FittedTask>, pub shortened: bool, pub tags_over: bool, pub checklist_over: bool, pub notes_cut: bool }
#[derive(Default)]
pub(crate) struct Summary { pub things_checklists: bool }
impl Summary {
    pub fn from_fitted(_: &[Fitted]) -> Self { todo!() }
    pub fn lines(&self) -> Vec<String> { todo!() }
}
pub(crate) fn fit(_: RawItem) -> Fitted { todo!() }
