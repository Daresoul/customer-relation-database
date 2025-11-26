pub mod patient;
pub mod dto;
pub mod household;
pub mod medical;
pub mod settings;
pub mod appointments;
pub mod rooms;
pub mod google_calendar;
pub mod sync_log;
pub mod update_models;
pub mod species;
pub mod breed;
pub mod device_integration;

// Re-exports for public API - some may be unused internally but available for external use
#[allow(unused_imports)]
pub use patient::Patient;
#[allow(unused_imports)]
pub use dto::{CreatePatientDto, UpdatePatientDto};
#[allow(unused_imports)]
pub use household::{
    Household, Person, PersonContact, PatientHousehold,
    CreateHouseholdDto, CreatePersonDto, CreateContactDto,
    CreatePersonWithContactsDto, CreateHouseholdWithPeopleDto,
    HouseholdSearchResult, SearchHouseholdsResponse,
    HouseholdWithPeople, CreatePatientWithHouseholdDto
};
#[allow(unused_imports)]
pub use medical::{
    MedicalRecord, MedicalAttachment, MedicalRecordHistory, Currency,
    CreateMedicalRecordInput, UpdateMedicalRecordInput,
    MedicalRecordFilter, PaginationParams,
    MedicalRecordsResponse, MedicalRecordDetail,
    SearchMedicalRecordsResponse, AttachmentData
};
#[allow(unused_imports)]
pub use settings::{
    AppSettings, SettingsResponse, UpdateSettingsRequest
};
#[allow(unused_imports)]
pub use appointments::{
    Appointment, AppointmentStatus, AppointmentDetail, PatientInfo,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    AppointmentListResponse, DuplicateAppointmentInput,
    ConflictCheckInput, ConflictCheckResponse
};
#[allow(unused_imports)]
pub use rooms::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter,
    RoomAvailability, RoomAppointmentSlot
};
#[allow(unused_imports)]
pub use google_calendar::{
    GoogleCalendarSettings, GoogleCalendarSettingsResponse,
    GoogleAuthRequest, UpdateGoogleCalendarSettingsInput,
    GoogleCalendar, GoogleCalendarEvent, EventDateTime,
    CreateGoogleEventInput, UpdateGoogleEventInput,
    OAuth2Config, TokenResponse
};
#[allow(unused_imports)]
pub use sync_log::{
    AppointmentSyncLog, SyncAction, SyncStatus,
    CreateSyncLogInput, SyncQueueItem, SyncResult, SyncError
};
#[allow(unused_imports)]
pub use update_models::UpdatePreferences;
#[allow(unused_imports)]
pub use species::{
    Species, CreateSpeciesInput, UpdateSpeciesInput
};
#[allow(unused_imports)]
pub use breed::{
    Breed, CreateBreedInput, UpdateBreedInput
};
#[allow(unused_imports)]
pub use device_integration::{
    DeviceIntegration, DeviceIntegrationRow, DeviceType, ConnectionType,
    CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput
};