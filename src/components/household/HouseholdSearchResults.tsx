import React from 'react';
import { Phone, Mail, MapPin, User, Users } from 'lucide-react';
import { HouseholdSearchResult, PersonWithContacts } from '../../types/household';
import { getHouseholdDisplayName, getPrimaryContact } from '../../types/household';

interface HouseholdSearchResultsProps {
  results: HouseholdSearchResult[];
  onSelect: (household: HouseholdSearchResult) => void;
  isLoading?: boolean;
  className?: string;
}

export const HouseholdSearchResults: React.FC<HouseholdSearchResultsProps> = ({
  results,
  onSelect,
  isLoading = false,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center py-8`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={`${className} text-center py-8 text-gray-500`}>
        No households found
      </div>
    );
  }

  return (
    <div className={`${className} space-y-2`}>
      {results.map((household) => (
        <HouseholdCard
          key={household.id}
          household={household}
          onSelect={() => onSelect(household)}
        />
      ))}
    </div>
  );
};

interface HouseholdCardProps {
  household: HouseholdSearchResult;
  onSelect: () => void;
}

const HouseholdCard: React.FC<HouseholdCardProps> = ({ household, onSelect }) => {
  const displayName = getHouseholdDisplayName({
    household: {
      id: household.id,
      householdName: household.householdName,
      address: household.address,
      notes: undefined,
      createdAt: '',
      updatedAt: '',
    },
    people: household.people,
  });


  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            {household.people.length > 1 ? (
              <Users className="h-5 w-5 text-gray-400 mr-2" />
            ) : (
              <User className="h-5 w-5 text-gray-400 mr-2" />
            )}
            <h3 className="text-lg font-medium text-gray-900">{displayName}</h3>
          </div>

          {/* People in household */}
          <div className="space-y-2 ml-7">
            {household.people.map((person) => (
              <PersonInfo key={person.id} person={person} />
            ))}
          </div>

          {/* Address */}
          {household.address && (
            <div className="flex items-center mt-2 ml-7 text-sm text-gray-600">
              <MapPin className="h-4 w-4 mr-1" />
              <span>{household.address}</span>
            </div>
          )}
        </div>

        {/* Relevance score badge */}
        {household.relevanceScore > 0 && (
          <div className="ml-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {Math.round(household.relevanceScore * 100)}% match
            </span>
          </div>
        )}
      </div>

      {/* Search snippet */}
      {household.snippet && (
        <div
          className="mt-2 ml-7 text-sm text-gray-500"
          dangerouslySetInnerHTML={{ __html: household.snippet }}
        />
      )}
    </div>
  );
};

interface PersonInfoProps {
  person: PersonWithContacts;
}

const PersonInfo: React.FC<PersonInfoProps> = ({ person }) => {
  const primaryPhone = getPrimaryContact(person, 'phone') ||
                       getPrimaryContact(person, 'mobile');
  const primaryEmail = getPrimaryContact(person, 'email');

  return (
    <div className="text-sm">
      <div className="flex items-center">
        <span className="font-medium text-gray-900">
          {person.firstName} {person.lastName}
        </span>
        {person.isPrimary && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            Primary
          </span>
        )}
      </div>
      <div className="flex items-center space-x-4 mt-1">
        {primaryPhone && (
          <div className="flex items-center text-gray-600">
            <Phone className="h-3 w-3 mr-1" />
            <span>{primaryPhone.contactValue}</span>
          </div>
        )}
        {primaryEmail && (
          <div className="flex items-center text-gray-600">
            <Mail className="h-3 w-3 mr-1" />
            <span>{primaryEmail.contactValue}</span>
          </div>
        )}
      </div>
    </div>
  );
};