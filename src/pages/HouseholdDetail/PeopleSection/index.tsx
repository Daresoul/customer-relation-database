import React, { useState } from 'react';
import { Button, Typography, Empty, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PersonWithContacts, CreatePersonWithContactsDto } from '../../../types/household';
import { PersonCard } from './PersonCard';
import { AddPersonModal } from './AddPersonModal';
import { useAddPerson } from '../../../hooks/useHousehold';
import { knownErrorMessage } from '@/utils/errors';
import styles from '../HouseholdDetail.module.css';

const { Title } = Typography;

interface PeopleSectionProps {
  people: PersonWithContacts[];
  householdId: number;
}

export const PeopleSection: React.FC<PeopleSectionProps> = ({ people, householdId }) => {
  const { notification } = App.useApp();
  const { t } = useTranslation('households');
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const addPerson = useAddPerson();

  // Rethrows so AddPersonModal keeps what was typed.
  const handleAddPerson = async (personData: CreatePersonWithContactsDto) => {
    try {
      await addPerson.mutateAsync({
        householdId,
        person: personData
      });
    } catch (error) {
      notification.error({
        message: t('common:error'),
        description: knownErrorMessage(error, t) || t('detail.people.failedToAdd'),
        placement: 'bottomRight',
        duration: 5,
      });
      throw error;
    }
    setIsAddingPerson(false);
    notification.success({ message: t('common:success'), description: t('detail.people.personAdded'), placement: 'bottomRight', duration: 3 });
  };

  return (
    <div className={styles.sectionContainer}>
      <div className={styles.sectionHeaderRow}>
        <Title level={4}>{t('detail.people.title')}</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsAddingPerson(true)}
        >
          {t('detail.people.addPerson')}
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
            />
          ))}
        </div>
      ) : (
        <Empty
          description={t('detail.people.noPeople')}
          className={styles.marginBottom24}
        >
          <Button type="primary" onClick={() => setIsAddingPerson(true)}>
            {t('detail.people.addFirstPerson')}
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