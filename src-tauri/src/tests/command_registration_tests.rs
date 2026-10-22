//! Debug-only commands (database reset/wipe/populate, the device simulator)
//! must never be registered in a release build. Checked against the source
//! of `main.rs`, since the release handler is not compiled into test builds.

const MAIN_RS: &str = include_str!("../main.rs");

const DEBUG_ONLY_COMMANDS: &[&str] = &[
    "debug_database_info",
    "reset_database",
    "wipe_database_data",
    "populate_database",
    "get_virtual_port_status",
    "start_virtual_ports",
    "stop_virtual_ports",
    "send_test_healvet",
    "send_test_pointcare",
    "send_test_pcr",
    "send_test_exigo",
];

struct HandlerBlock {
    debug_only: bool,
    commands: Vec<String>,
}

fn handler_blocks() -> Vec<HandlerBlock> {
    let mut blocks = Vec::new();
    let mut rest = MAIN_RS;
    let mut consumed = 0;
    while let Some(start) = rest.find("generate_handler![") {
        let abs_start = consumed + start;
        let body_start = start + "generate_handler![".len();
        let body_len = rest[body_start..].find(']').expect("unterminated generate_handler!");
        let body = &rest[body_start..body_start + body_len];

        let preceding = &MAIN_RS[..abs_start];
        let statement_start = preceding.rfind(';').unwrap_or(0);
        let debug_only = preceding[statement_start..].contains("#[cfg(debug_assertions)]");

        let commands = body
            .lines()
            .map(str::trim)
            .filter(|l| !l.starts_with("//"))
            .flat_map(|l| l.split(','))
            .map(|c| c.trim().rsplit("::").next().unwrap_or("").to_string())
            .filter(|c| !c.is_empty())
            .collect();

        blocks.push(HandlerBlock { debug_only, commands });
        consumed += body_start + body_len;
        rest = &MAIN_RS[consumed..];
    }
    blocks
}

#[test]
fn release_handler_does_not_register_debug_only_commands() {
    let blocks = handler_blocks();
    let release: Vec<&HandlerBlock> = blocks.iter().filter(|b| !b.debug_only).collect();
    assert_eq!(release.len(), 1, "expected exactly one ungated generate_handler!");
    assert!(release[0].commands.contains(&"log_event".to_string()));

    let leaked: Vec<&&str> = DEBUG_ONLY_COMMANDS
        .iter()
        .filter(|c| release[0].commands.iter().any(|r| r == *c))
        .collect();
    assert!(leaked.is_empty(), "registered in release builds: {leaked:?}");
}

#[test]
fn debug_handler_still_registers_debug_only_commands() {
    let blocks = handler_blocks();
    let debug: Vec<&String> = blocks
        .iter()
        .filter(|b| b.debug_only)
        .flat_map(|b| b.commands.iter())
        .collect();
    for cmd in DEBUG_ONLY_COMMANDS {
        assert!(
            debug.iter().any(|d| d == cmd),
            "{cmd} missing from the #[cfg(debug_assertions)] handler"
        );
    }
}
