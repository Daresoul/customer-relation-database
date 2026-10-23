//! Google Calendar events carry what the front desk needs to see on a phone,
//! not the microchip number (security-privacy.md M2).

use crate::services::google_calendar::event_description;

#[test]
fn the_event_text_has_patient_room_status_and_notes() {
    let text = event_description("Rex", Some("Exam 1"), "scheduled", Some("Bring the vaccine card"));

    assert_eq!(text, "Patient: Rex\nRoom: Exam 1\nStatus: scheduled\n\nBring the vaccine card");
}

#[test]
fn the_event_text_never_carries_a_microchip_number() {
    let text = event_description("Rex", None, "scheduled", None);

    assert!(!text.to_lowercase().contains("microchip"), "{text}");
    assert_eq!(text, "Patient: Rex\nStatus: scheduled");
}

#[test]
fn empty_notes_add_no_blank_lines() {
    assert_eq!(event_description("Rex", None, "completed", Some("")), "Patient: Rex\nStatus: completed");
}
