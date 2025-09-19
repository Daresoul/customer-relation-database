/**
 * HouseholdList - Component for displaying a list of household search results
 */

import React from 'react';
import { HouseholdSearchResult } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

interface HouseholdListProps {
  households: HouseholdSearchResult[];
  loading: boolean;
  error?: string | null;
  onHouseholdClick?: (household: HouseholdSearchResult) => void;
  onEditHousehold?: (household: HouseholdSearchResult) => void;
  onDeleteHousehold?: (household: HouseholdSearchResult) => void;
  onCreateHousehold?: () => void;
  className?: string;
}

interface HouseholdCardProps {
  household: HouseholdSearchResult;
  onClick?: (household: HouseholdSearchResult) => void;
  onEdit?: (household: HouseholdSearchResult) => void;
  onDelete?: (household: HouseholdSearchResult) => void;
}

const HouseholdCard: React.FC<HouseholdCardProps> = ({
  household,
  onClick,
  onEdit,
  onDelete,
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick(household);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(household);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(household);
    }
  };

  const getPrimaryContact = () => {
    return household.contacts.find(c => c.isPrimary) || household.contacts[0];
  };

  const getSecondaryContacts = () => {
    return household.contacts.filter(c => !c.isPrimary);
  };

  // Get people names from the household if available
  const getPeopleNames = () => {
    // This should be populated from the backend in a real implementation
    // For now, we'll show placeholder or extract from household name
    if (household.householdName && household.householdName.includes('family')) {
      const familyName = household.householdName.replace(' family', '').replace(' Family', '');
      return familyName;
    }
    return 'Family members';
  };

  const primaryContact = getPrimaryContact();
  const secondaryContacts = getSecondaryContacts();

  return (
    <div
      className="household-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <div className="household-card__header">
        <div className="household-info">
          <h3 className="household-name">{household.householdName}</h3>
          <p className="household-members">👥 {getPeopleNames()}</p>
          {household.address && (
            <p className="household-address">
              📍 {household.address}
              {household.city && `, ${household.city}`}
              {household.postalCode && ` ${household.postalCode}`}
            </p>
          )}
        </div>

      </div>

      <div className="household-card__body">
        <div className="household-stats">
          <div className="stat">
            <span className="stat-label">🐾 Pets:</span>
            <span className="stat-value">{household.petCount || 0}</span>
          </div>
          <div className="stat">
            <span className="stat-label">👤 Contacts:</span>
            <span className="stat-value">{household.contacts.length || 0}</span>
          </div>
        </div>

        <div className="household-contacts">
          {primaryContact && (
            <div className="contact primary-contact">
              <span className="contact-icon">
                {primaryContact.type === 'phone' || primaryContact.type === 'mobile' ? '📱' : '✉️'}
              </span>
              <span className="contact-value">{primaryContact.value}</span>
              <span className="contact-badge">Primary</span>
            </div>
          )}

          {secondaryContacts.slice(0, 2).map((contact, index) => (
            <div key={index} className="contact secondary-contact">
              <span className="contact-icon">
                {contact.type === 'phone' || contact.type === 'mobile' ? '📱' : '✉️'}
              </span>
              <span className="contact-value">{contact.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const HouseholdList: React.FC<HouseholdListProps> = ({
  households,
  loading,
  error,
  onHouseholdClick,
  onEditHousehold,
  onDeleteHousehold,
  onCreateHousehold,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`household-list household-list--loading ${className}`}>
        <LoadingSpinner />
        <p>Loading households...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`household-list household-list--error ${className}`}>
        <div className="error-message">
          <h3>Error Loading Households</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (households.length === 0) {
    return (
      <div className={`household-list household-list--empty ${className}`}>
        <EmptyState
          title="No households found"
          message="There are no households in the system yet."
        />
      </div>
    );
  }

  return (
    <div className={`household-list ${className}`}>
      <div className="household-grid">
        {households.map((household) => (
          <HouseholdCard
            key={household.id}
            household={household}
            onClick={onHouseholdClick}
            onEdit={onEditHousehold}
            onDelete={onDeleteHousehold}
          />
        ))}
      </div>
    </div>
  );
};

export default HouseholdList;