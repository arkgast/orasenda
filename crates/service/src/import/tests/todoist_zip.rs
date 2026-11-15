use std::io::Write;

use zip::CompressionMethod;
use zip::write::{SimpleFileOptions, ZipWriter};

use super::todoist::Scratch;
use crate::import::todoist::{ParseError, parse_file};

const CSV: &str = "TYPE,CONTENT\ntask,";

fn options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)
}

/// Writes a zip with the given (name, bytes) entries; a name ending in `/` is a directory.
fn build(dir: &Scratch, entries: &[(&str, Vec<u8>)]) -> std::path::PathBuf {
    let path = dir.0.join("Backup.zip");
    let mut zip = ZipWriter::new(std::fs::File::create(&path).expect("create"));
    for (name, bytes) in entries {
        if name.ends_with('/') {
            zip.add_directory(*name, options()).expect("dir");
        } else {
            zip.start_file(*name, options()).expect("start");
            zip.write_all(bytes).expect("write");
        }
    }
    zip.finish().expect("finish");
    path
}

fn task(title: &str) -> Vec<u8> {
    format!("{CSV}{title}\n").into_bytes()
}

#[test]
fn zip_skips_macosx_nested_and_dirs() {
    let dir = Scratch::new("skips");
    let path = build(
        &dir,
        &[
            ("Home.csv", task("Keep")),
            ("__MACOSX/", Vec::new()),
            ("__MACOSX/._Home.csv", task("Junk")),
            ("folder/", Vec::new()),
            ("folder/Deep.csv", task("Deep")),
            ("inner.zip", task("Nested")),
            ("notes.txt", task("Text")),
        ],
    );
    let items = parse_file(&path).expect("parses");
    let titles: Vec<&str> = items.iter().map(|i| i.title.as_str()).collect();
    assert_eq!(titles, ["Keep"]);
    assert_eq!(items[0].tags, ["Home"]);
}

#[test]
fn zip_entries_in_name_order() {
    let dir = Scratch::new("order");
    let path = build(
        &dir,
        &[
            ("Zed [9].csv", task("Z")),
            ("Alpha (2).csv", task("A")),
            ("Mid.csv", task("M")),
        ],
    );
    let items = parse_file(&path).expect("parses");
    let got: Vec<(&str, &str)> = items
        .iter()
        .map(|i| (i.title.as_str(), i.tags[0].as_str()))
        .collect();
    assert_eq!(got, [("A", "Alpha"), ("M", "Mid"), ("Z", "Zed")]);
}

#[test]
fn zip_bomb_capped_at_50mb() {
    let dir = Scratch::new("bomb");
    let mut big = CSV.as_bytes().to_vec();
    big.resize(51 * 1024 * 1024, b'a');
    let path = build(&dir, &[("Bomb.csv", big)]);
    assert!(std::fs::metadata(&path).expect("meta").len() < 20 * 1024 * 1024);
    assert_eq!(parse_file(&path), Err(ParseError::TooLarge));
    // Several entries that add up past the cap are refused too.
    let mut part = CSV.as_bytes().to_vec();
    part.resize(20 * 1024 * 1024, b'a');
    let path = build(
        &dir,
        &[
            ("A.csv", part.clone()),
            ("B.csv", part.clone()),
            ("C.csv", part),
        ],
    );
    assert_eq!(parse_file(&path), Err(ParseError::TooLarge));
}

#[test]
fn zip_over_500_entries_refused() {
    let dir = Scratch::new("many");
    let names: Vec<String> = (0..501).map(|i| format!("P{i:03}.csv")).collect();
    let entries: Vec<(&str, Vec<u8>)> = names.iter().map(|n| (n.as_str(), task("T"))).collect();
    let path = build(&dir, &entries);
    assert_eq!(parse_file(&path), Err(ParseError::TooLarge));
    let path = build(&dir, &entries[..500]);
    assert_eq!(parse_file(&path).expect("500 is fine").len(), 500);
}

#[test]
fn zip_without_csv_not_an_export() {
    let dir = Scratch::new("nocsv");
    let path = build(
        &dir,
        &[("readme.txt", task("x")), ("__MACOSX/a.csv", task("y"))],
    );
    assert_eq!(parse_file(&path), Err(ParseError::NotAnExport));
    let path = build(&dir, &[("Bad.csv", b"A,B\n1,2\n".to_vec())]);
    assert_eq!(parse_file(&path), Err(ParseError::NotAnExport));
    std::fs::write(dir.0.join("Junk.zip"), b"PK\x03\x04 not really").expect("write");
    assert_eq!(
        parse_file(&dir.0.join("Junk.zip")),
        Err(ParseError::Unreadable)
    );
}
