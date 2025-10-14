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

pub use patient::Patient;
pub use dto::{CreatePatientDto, UpdatePatientDto};
pub use household::{
    Household, Person, PersonContact, PatientHousehold,
    CreateHouseholdDto, CreatePersonDto, CreateContactDto,
    CreatePersonWithContactsDto, CreateHouseholdWithPeopleDto,
    HouseholdSearchResult, SearchHouseholdsResponse,
    HouseholdWithPeople, CreatePatientWithHouseholdDto
};
pub use medical::{
    MedicalRecord, MedicalAttachment, MedicalRecordHistory, Currency,
    CreateMedicalRecordInput, UpdateMedicalRecordInput,
    MedicalRecordFilter, PaginationParams,
    MedicalRecordsResponse, MedicalRecordDetail,
    SearchMedicalRecordsResponse, AttachmentData
};
pub use settings::{
    AppSettings, SettingsResponse, UpdateSettingsRequest
};
pub use appointments::{
    Appointment, AppointmentStatus, AppointmentDetail, PatientInfo,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    AppointmentListResponse, DuplicateAppointmentInput,
    ConflictCheckInput, ConflictCheckResponse
};
pub use rooms::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter,
    RoomAvailability, RoomAppointmentSlot
};
pub use google_calendar::{
    GoogleCalendarSettings, GoogleCalendarSettingsResponse,
    GoogleAuthRequest, UpdateGoogleCalendarSettingsInput,
    GoogleCalendar, GoogleCalendarEvent, EventDateTime,
    CreateGoogleEventInput, UpdateGoogleEventInput,
    OAuth2Config, TokenResponse
};
pub use sync_log::{
    AppointmentSyncLog, SyncAction, SyncStatus,
    CreateSyncLogInput, SyncQueueItem, SyncResult, SyncError
};
pub use update_models::UpdatePreferences;
pub use species::{
    Species, CreateSpeciesInput, UpdateSpeciesInput
};
pub use breed::{
    Breed, CreateBreedInput, UpdateBreedInput
};
pub use device_integration::{
    DeviceIntegration, DeviceIntegrationRow, DeviceType, ConnectionType,
    CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput
};