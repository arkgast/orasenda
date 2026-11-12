use super::*;

fn with(edit: impl FnOnce(&mut PresetDef)) -> Result<(), PresetInvalid> {
    let mut preset = default_presets()[1].clone();
    edit(&mut preset);
    preset.validate()
}

fn refused(field: PresetField) -> Result<(), PresetInvalid> {
    Err(PresetInvalid { field })
}

#[test]
fn preset_validation_edges() {
    for (value, ok) in [(4, false), (5, true), (180, true), (181, false)] {
        let got = with(|p| p.focus_min = value);
        assert_eq!(got.is_ok(), ok, "focus {value}");
        if !ok {
            assert_eq!(got, refused(PresetField::FocusMin));
        }
    }
    for (value, ok) in [(0, false), (1, true), (60, true), (61, false)] {
        let got = with(|p| p.break_min = value);
        assert_eq!(got.is_ok(), ok, "break {value}");
        if !ok {
            assert_eq!(got, refused(PresetField::BreakMin));
        }
    }
    for (value, ok) in [(4, false), (5, true), (90, true), (91, false)] {
        let got = with(|p| p.long_break_min = value);
        assert_eq!(got.is_ok(), ok, "long {value}");
        if !ok {
            assert_eq!(got, refused(PresetField::LongBreakMin));
        }
    }
    for (value, ok) in [(0, false), (1, true), (8, true), (9, false)] {
        let got = with(|p| p.rounds = value);
        assert_eq!(got.is_ok(), ok, "rounds {value}");
        if !ok {
            assert_eq!(got, refused(PresetField::Rounds));
        }
    }
    assert_eq!(with(|p| p.name = "   ".into()), refused(PresetField::Name));
    assert_eq!(
        with(|p| p.name = "x".repeat(41)),
        refused(PresetField::Name)
    );
    assert_eq!(with(|p| p.name = "x".repeat(40)), Ok(()));
}

#[test]
fn normalize_name_trims_and_refuses_blank() {
    assert_eq!(
        normalize_name("  Deep dive \n").as_deref(),
        Some("Deep dive")
    );
    assert_eq!(normalize_name(""), None);
    assert_eq!(normalize_name("   \t "), None);
    assert_eq!(
        normalize_name(&format!(" {} ", "é".repeat(40))).map(|n| n.chars().count()),
        Some(40)
    );
    assert_eq!(normalize_name(&"é".repeat(41)), None);
}

#[test]
fn default_presets_fixed_ids() {
    let got: Vec<_> = default_presets()
        .into_iter()
        .map(|p| {
            assert_eq!(p.validate(), Ok(()));
            (
                p.id.0,
                p.name,
                p.focus_min,
                p.break_min,
                p.long_break_min,
                p.rounds,
                p.default_key,
            )
        })
        .collect();
    let expected = [
        (
            "0192f6a0-0000-7000-8000-000000000001",
            "Gentle Start",
            15,
            5,
            15,
            4,
            DefaultPreset::GentleStart,
        ),
        (
            "0192f6a0-0000-7000-8000-000000000002",
            "Steady Focus",
            25,
            5,
            15,
            4,
            DefaultPreset::SteadyFocus,
        ),
        (
            "0192f6a0-0000-7000-8000-000000000003",
            "Deep Work",
            90,
            15,
            30,
            2,
            DefaultPreset::DeepWork,
        ),
    ];
    for (g, e) in got.into_iter().zip(expected) {
        assert_eq!(
            (g.0.as_str(), g.1.as_str(), g.2, g.3, g.4, g.5, g.6),
            (e.0, e.1, e.2, e.3, e.4, e.5, Some(e.6))
        );
    }
}

#[test]
fn session_preset_lengths() {
    let [_, steady, _] = default_presets();
    let library = SessionPreset::Library {
        id: steady.id,
        name: steady.name,
        focus_min: steady.focus_min,
        break_min: steady.break_min,
        long_break_min: steady.long_break_min,
        rounds: steady.rounds,
    };
    assert_eq!(library.focus_ms(), 1_500_000);
    assert_eq!(library.break_ms(false), 300_000);
    assert_eq!(library.break_ms(true), 900_000);
    assert_eq!(library.rounds(), 4);
    assert_eq!(SessionPreset::Quick.focus_ms(), QUICK_START_MS);
    assert_eq!(SessionPreset::Quick.break_ms(true), 0);
}
