pub mod patient;
pub mod dto;
pub mod household;
pub mod medical;

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