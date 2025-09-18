/**
 * Sample data generator for development
 */

export const generateSampleData = async () => {
  try {
    const { invoke } = await import('@tauri-apps/api');

    // Create sample owners
    const owners = [
      { firstName: 'John', lastName: 'Smith', email: 'john.smith@email.com', phone: '555-0101' },
      { firstName: 'Mary', lastName: 'Johnson', email: 'mary.j@email.com', phone: '555-0102' },
      { firstName: 'Robert', lastName: 'Williams', email: 'r.williams@email.com', phone: '555-0103' },
    ];

    const createdOwners = [];
    for (const owner of owners) {
      try {
        const created = await invoke('create_owner', { input: owner });
        createdOwners.push(created);
      } catch (e) {
        console.error('Failed to create owner:', e);
      }
    }

    // Create sample patients with owners
    const patients = [
      {
        name: 'Max',
        species: 'Dog',
        breed: 'Golden Retriever',
        weight: 30.5,
        medicalNotes: 'Healthy and active dog. Regular checkups recommended.',
        ownerId: (createdOwners[0] as any)?.id
      },
      {
        name: 'Luna',
        species: 'Cat',
        breed: 'Persian',
        weight: 4.2,
        medicalNotes: 'Indoor cat. Annual vaccinations up to date.',
        ownerId: (createdOwners[1] as any)?.id
      },
      {
        name: 'Charlie',
        species: 'Dog',
        breed: 'Labrador',
        weight: 28.0,
        medicalNotes: 'Friendly dog. Had hip surgery in 2022.',
        ownerId: (createdOwners[2] as any)?.id
      },
      {
        name: 'Bella',
        species: 'Cat',
        breed: 'Siamese',
        weight: 3.8,
        ownerId: (createdOwners[0] as any)?.id
      },
      {
        name: 'Buddy',
        species: 'Dog',
        breed: 'Beagle',
        weight: 12.5,
        ownerId: (createdOwners[1] as any)?.id
      },
    ];

    for (const patient of patients) {
      if (patient.ownerId) {
        try {
          await invoke('create_patient', { input: patient });
        } catch (e) {
          console.error('Failed to create patient:', e);
        }
      }
    }

    console.log('Sample data generated successfully!');
    return true;
  } catch (error) {
    console.error('Failed to generate sample data:', error);
    return false;
  }
};