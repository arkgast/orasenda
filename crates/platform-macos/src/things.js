// Reads the open to-dos from Things. Run by osascript with the caller line appended in Rust.
// Read-only: no shell, no files, no standard additions. Dates leave as local YYYY-MM-DD text.
// biome-ignore lint/correctness/noUnusedVariables: called by the line Rust appends.
function collect(app) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null);
  const open = app.toDos.whose({ status: "open" });
  const ids = open.id();
  const names = open.name();
  const notes = open.notes();
  const tags = open.tagNames();
  const due = open.dueDate();
  const when = open.activationDate();
  const projects = open.project.name();
  const areas = open.area.name();
  return JSON.stringify(
    ids.map((id, i) => ({
      id: String(id),
      name: names[i] || "",
      notes: notes[i] || "",
      project: projects[i] || null,
      area: areas[i] || null,
      tagNames: tags[i] || "",
      dueDate: day(due[i]),
      activationDate: day(when[i]),
    })),
  );
}
