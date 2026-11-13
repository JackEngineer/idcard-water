use watermark_core::{CoreError, WatermarkDraft, WatermarkSpec};

#[test]
fn rejects_empty_watermark() {
    assert!(matches!(
        WatermarkSpec::try_from(WatermarkDraft::default()),
        Err(CoreError::EmptyText)
    ));
}

#[test]
fn accepts_chinese_with_date() {
    let spec = WatermarkSpec::try_from(WatermarkDraft {
        text: "仅供测试单位办理测试业务使用\n2026-11-13".into(),
        ..WatermarkDraft::default()
    });
    assert!(spec.is_ok());
}

#[test]
fn validates_unicode_lines_and_numeric_boundaries() {
    for (text, ok) in [
        ("中".repeat(200), true),
        ("中".repeat(201), false),
        ("一\n二\n三\n四".into(), true),
        ("一\n二\n三\n四\n五".into(), false),
        (" \n\t".into(), false),
    ] {
        assert_eq!(
            WatermarkSpec::try_from(WatermarkDraft {
                text,
                ..WatermarkDraft::default()
            })
            .is_ok(),
            ok
        );
    }
    for value in [f32::NAN, f32::INFINITY, 0.0, 0.61] {
        assert!(matches!(
            WatermarkSpec::try_from(WatermarkDraft {
                text: "测试".into(),
                opacity: value,
                ..WatermarkDraft::default()
            }),
            Err(CoreError::InvalidStyle)
        ));
    }
    let spec = WatermarkSpec::try_from(WatermarkDraft {
        text: "测试\r\n日期".into(),
        ..WatermarkDraft::default()
    })
    .unwrap();
    assert_eq!(spec.text(), "测试\n日期");
}
