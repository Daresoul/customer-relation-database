import React, { useState } from 'react';
import { Button, Space, Typography, Empty, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PersonWithContacts, CreatePersonWithContactsDto } from '../../../types/household';
import { PersonCard } from './PersonCard';
import { AddPersonModal } from './AddPersonModal';
import { useAddPerson } from '../../../hooks/useHousehold';

const { Title } = Typography;

interface PeopleSectionProps {
  people: PersonWithContacts[];
  householdId: number;
}

export const PeopleSection: React.FC<PeopleSectionProps> = ({ people, householdId }) => {
  const { message } = App.useApp();
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const addPerson = useAddPerson();

  const handleAddPerson = async (personData: CreatePersonWithContactsDto) => {
    try {
      await addPerson.mutateAsync({
        householdId,
        person: personData
      });
      setIsAddingPerson(false);
      message.success('Person added successfully');
    } catch (error) {
      message.error('Failed to add person');
      console.error('Add person failed:', error);
    }
  };

  const handlePrimaryChange = (personId: number) => {
    // This is handled by the backend when updating isPrimary
    // The backend ensures only one person is primary
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4}>People & Contacts</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsAddingPerson(true)}
        >
          Add Person
        </Button>
      </div>

      {people.length > 0 ? (
        <div>
          {people.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              householdId={householdId}
              canDelete={people.length > 1}
              onPrimaryChange={handlePrimaryChange}
            />
          ))}
        </div>
      ) : (
        <Empty
          description="No people in this household"
          style={{ marginBottom: 24 }}
        >
          <Button type="primary" onClick={() => setIsAddingPerson(true)}>
            Add First Person
          </Button>
        </Empty>
      )}

      <AddPersonModal
        visible={isAddingPerson}
        onCancel={() => setIsAddingPerson(false)}
        onAdd={handleAddPerson}
        loading={addPerson.isPending}
      />
    </div>
  );
};