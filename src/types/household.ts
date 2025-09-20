// Core household entities
export interface Household {
  id: number;
  householdName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: number;
  householdId: number;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonContact {
  id: number;
  personId: number;
  contactType: 'phone' | 'email' | 'mobile' | 'work_phone';
  contactValue: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface PatientHousehold {
  id: number;
  patientId: number;
  householdId: number;
  relationshipType: string;
  isPrimary: boolean;
  createdAt: string;
}

// DTOs for creation
export interface CreateHouseholdDto {
  householdName?: string;
  address?: string;
  notes?: string;
}

export interface CreatePersonDto {
  firstName: string;
  lastName: string;
  isPrimary?: boolean;
}

export interface CreateContactDto {
  contactType: 'phone' | 'email' | 'mobile' | 'work_phone';
  contactValue: string;
  isPrimary?: boolean;
}

export interface CreatePersonWithContactsDto {
  person: CreatePersonDto;
  contacts: CreateContactDto[];
}

export interface CreateHouseholdWithPeopleDto {
  household: CreateHouseholdDto;
  people: CreatePersonWithContactsDto[];
}

// Search results
export interface PersonWithContacts {
  id: number;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  contacts: PersonContact[];
}

export interface HouseholdSearchResult {
  id: number;
  householdName?: string;
  address?: string;
  people: PersonWithContacts[];
  petCount: number;
  relevanceScore: number;
  snippet?: string;
}

export interface SearchHouseholdsResponse {
  results: HouseholdSearchResult[];
  total: number;
  hasMore: boolean;
}

// Complete household with all relations
export interface HouseholdWithPeople {
  household: Household;
  people: PersonWithContacts[];
  petCount: number;
}

// Patient/Animal type for display
export interface Patient {
  id: number;
  name: string;
  species: string;
  breed?: string;
  dateOfBirth?: string;
  weight?: number;
  gender?: 'male' | 'female' | 'unknown';
  status?: 'active' | 'inactive';
}

// Household detail view with patients
export interface HouseholdDetailView extends HouseholdWithPeople {
  patients: Patient[];
}

// For patient creation with household
export interface CreatePatientWithHouseholdDto {
  household: CreateHouseholdDto;
  people: CreatePersonWithContactsDto[];
  patient: CreatePatientDto;
  relationship?: PatientRelationship;
}

export interface PatientRelationship {
  relationshipType?: string;
  isPrimary?: boolean;
}

// Patient types (referenced from existing patient.ts)
export interface CreatePatientDto {
  name: string;
  species: string;
  breed?: string;
  dateOfBirth?: string;
  weight?: number;
  medicalNotes?: string;
}

// Response for patient with household creation
export interface CreatePatientWithHouseholdResponse {
  household: HouseholdWithPeople;
  patientId: number;
}

// Validation helpers
export function validateHouseholdDto(dto: CreateHouseholdWithPeopleDto): string | null {
  // Must have at least 1 person, max 5
  if (!dto.people || dto.people.length === 0) {
    return "Household must have at least one person";
  }
  if (dto.people.length > 5) {
    return "Household cannot have more than 5 people";
  }

  // Check that only one person is marked as primary
  const primaryCount = dto.people.filter(p => p.person.isPrimary).length;
  if (primaryCount > 1) {
    return "Only one person can be marked as primary";
  }

  // Validate each person
  for (const personWithContacts of dto.people) {
    if (!personWithContacts.person.firstName || personWithContacts.person.firstName.trim() === '') {
      return "First name is required for all people";
    }
    if (!personWithContacts.person.lastName || personWithContacts.person.lastName.trim() === '') {
      return "Last name is required for all people";
    }

    // Validate contacts
    for (const contact of personWithContacts.contacts) {
      const validTypes = ['phone', 'email', 'mobile', 'work_phone'];
      if (!validTypes.includes(contact.contactType)) {
        return `Invalid contact type: ${contact.contactType}`;
      }

      // Basic email validation
      if (contact.contactType === 'email' && !contact.contactValue.includes('@')) {
        return `Invalid email: ${contact.contactValue}`;
      }

      // Basic phone validation (at least 10 digits)
      if (['phone', 'mobile', 'work_phone'].includes(contact.contactType)) {
        const digits = contact.contactValue.replace(/\D/g, '');
        if (digits.length < 10) {
          return `Phone number must have at least 10 digits: ${contact.contactValue}`;
        }
      }
    }
  }

  return null;
}

// Display helpers
export function getHouseholdDisplayName(household: HouseholdWithPeople): string {
  if (household.household.householdName) {
    return household.household.householdName;
  }

  if (household.people.length === 1) {
    const person = household.people[0];
    return `${person.firstName} ${person.lastName}`;
  }

  if (household.people.length === 2) {
    const lastNames = household.people.map(p => p.lastName);
    if (lastNames[0] === lastNames[1]) {
      return `${household.people[0].firstName} & ${household.people[1].firstName} ${lastNames[0]}`;
    }
    return `${lastNames[0]} & ${lastNames[1]}`;
  }

  return `Household ${household.household.id}`;
}

export function getPrimaryPerson(household: HouseholdWithPeople): PersonWithContacts | undefined {
  return household.people.find(p => p.isPrimary) || household.people[0];
}

export function getPrimaryContact(person: PersonWithContacts, type?: 'phone' | 'email' | 'mobile' | 'work_phone'): PersonContact | undefined {
  if (type) {
    return person.contacts.find(c => c.contactType === type && c.isPrimary) ||
           person.contacts.find(c => c.contactType === type);
  }
  return person.contacts.find(c => c.isPrimary) || person.contacts[0];
}