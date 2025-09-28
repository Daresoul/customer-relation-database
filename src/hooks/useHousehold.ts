import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api';
import {
  HouseholdDetailView,
  Household,
  PersonWithContacts,
  CreatePersonWithContactsDto,
  PersonContact
} from '../types/household';

// Fetch household with all details
export function useHouseholdDetail(householdId: number) {
  return useQuery({
    queryKey: ['household', householdId],
    queryFn: async () => {
      // Fetch household and people
      const result = await invoke<any>('get_household_with_people', {
        householdId
      });


      // Transform the response to match our expected format
      const transformed: HouseholdDetailView = {
        household: {
          id: result.household?.id || result.id,
          householdName: result.household?.household_name || result.household?.householdName || '',
          address: result.household?.address || '',
          city: result.household?.city || '',
          postalCode: result.household?.postal_code || result.household?.postalCode || '',
          notes: result.household?.notes || '',
          createdAt: result.household?.created_at || result.household?.createdAt || '',
          updatedAt: result.household?.updated_at || result.household?.updatedAt || ''
        },
        people: result.people?.map((person: any) => ({
          id: person.id,
          firstName: person.first_name || person.firstName,
          lastName: person.last_name || person.lastName,
          isPrimary: person.is_primary || person.isPrimary || false,
          contacts: person.contacts?.map((contact: any) => ({
            id: contact.id,
            personId: contact.person_id || contact.personId,
            contactType: contact.contact_type || contact.contactType,
            contactValue: contact.contact_value || contact.contactValue,
            isPrimary: contact.is_primary || contact.isPrimary || false,
            createdAt: contact.created_at || contact.createdAt
          })) || []
        })) || [],
        patients: [] // Empty for now - will add separate fetch later
      };

      return transformed;
    },
    enabled: !!householdId,
  });
}

// Update household fields
export function useUpdateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      householdId,
      updates
    }: {
      householdId: number;
      updates: Partial<Household>
    }) => {
      // Use camelCase parameters (Tauri handles the conversion)
      return await invoke<Household>('update_household', {
        householdId,
        householdName: updates.householdName,
        address: updates.address,
        notes: updates.notes
      });
    },
    onMutate: async ({ householdId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['household', householdId] });

      // Snapshot previous value
      const previousHousehold = queryClient.getQueryData<HouseholdDetailView>(['household', householdId]);

      // Optimistically update
      if (previousHousehold) {
        queryClient.setQueryData<HouseholdDetailView>(['household', householdId], {
          ...previousHousehold,
          household: {
            ...previousHousehold.household,
            ...updates
          }
        });
      }

      return { previousHousehold };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousHousehold) {
        queryClient.setQueryData(['household', variables.householdId], context.previousHousehold);
      }
    },
    onSettled: (data, error, variables) => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['household', variables.householdId] });
    },
  });
}

// Add person to household
export function useAddPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      householdId,
      person
    }: {
      householdId: number;
      person: CreatePersonWithContactsDto
    }) => {
      return await invoke<PersonWithContacts>('add_person_to_household', {
        householdId,
        person
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['household', variables.householdId] });
    },
  });
}

// Update person
export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      personId,
      updates,
      householdId
    }: {
      personId: number;
      householdId: number;
      updates: Partial<PersonWithContacts>
    }) => {
      return await invoke<PersonWithContacts>('update_person', {
        personId,
        updates
      });
    },
    onMutate: async ({ personId, householdId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['household', householdId] });

      const previousHousehold = queryClient.getQueryData<HouseholdDetailView>(['household', householdId]);

      if (previousHousehold) {
        const updatedPeople = previousHousehold.people.map(person =>
          person.id === personId
            ? { ...person, ...updates }
            : person
        );

        queryClient.setQueryData<HouseholdDetailView>(['household', householdId], {
          ...previousHousehold,
          people: updatedPeople
        });
      }

      return { previousHousehold };
    },
    onError: (err, variables, context) => {
      if (context?.previousHousehold) {
        queryClient.setQueryData(['household', variables.householdId], context.previousHousehold);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['household', variables.householdId] });
    },
  });
}

// Delete person
export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      personId,
      householdId
    }: {
      personId: number;
      householdId: number;
    }) => {
      return await invoke('delete_person', { personId });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['household', variables.householdId] });
    },
  });
}

// Update person contacts
export function useUpdatePersonContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      personId,
      householdId,
      contacts
    }: {
      personId: number;
      householdId: number;
      contacts: Omit<PersonContact, 'id' | 'personId' | 'createdAt'>[]
    }) => {
      // Transform contacts to snake_case for backend
      const transformedContacts = contacts.map(contact => ({
        contact_type: contact.contactType,
        contact_value: contact.contactValue,
        is_primary: contact.isPrimary || false
      }));

      return await invoke<PersonContact[]>('update_person_contacts', {
        personId,
        contacts: transformedContacts
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['household', variables.householdId] });
    },
  });
}
// Fetch patients for a household
export function useHouseholdPatients(householdId: number) {
  return useQuery({
    queryKey: ['household-patients', householdId],
    queryFn: async () => {

      try {
        const result = await invoke('get_household_patients', {
          householdId  // Back to camelCase - matches other working commands
        });


        // Handle the result - it might already be an array or might need parsing
        const patients = Array.isArray(result) ? result : [];


        // Transform the patient data
        const transformed = patients.map((patient: any) => ({
          id: patient.id,
          name: patient.name,
          species: patient.species,
          breed: patient.breed,
          dateOfBirth: patient.dateOfBirth,
          weight: patient.weight,
          gender: patient.gender,
          status: patient.status || 'active'
        }));

        return transformed;
      } catch (error) {
        console.error(`Failed to fetch patients for household ${householdId}:`, error);
        throw error; // Re-throw to see the error in React Query
      }
    },
    enabled: !!householdId,
    staleTime: 0, // Always consider data stale
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}
