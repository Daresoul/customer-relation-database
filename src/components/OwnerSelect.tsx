/**
 * Owner selection dropdown component
 */

import React, { useState, useEffect } from 'react';
import { Owner, CreateOwnerInput } from '../types';
import { useOwners } from '../hooks/useOwners';
import LoadingSpinner from './LoadingSpinner';

interface OwnerSelectProps {
  value?: number;
  onChange: (ownerId: number | null) => void;
  onCreateOwner?: (owner: CreateOwnerInput) => Promise<Owner>;
  placeholder?: string;
  allowCreate?: boolean;
  className?: string;
  required?: boolean;
}

export const OwnerSelect: React.FC<OwnerSelectProps> = ({
  value,
  onChange,
  onCreateOwner,
  placeholder = 'Select an owner...',
  allowCreate = false,
  className = '',
  required = false
}) => {
  const { owners, loading, error, refreshOwners } = useOwners();
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOwner, setNewOwner] = useState<CreateOwnerInput>({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    refreshOwners();
  }, [refreshOwners]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    if (selectedValue === '') {
      onChange(null);
    } else if (selectedValue === 'create-new') {
      setShowCreateForm(true);
    } else {
      onChange(parseInt(selectedValue, 10));
    }
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateOwner || !newOwner.firstName.trim() || !newOwner.lastName.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const createdOwner = await onCreateOwner(newOwner);
      onChange(createdOwner.id);
      setShowCreateForm(false);
      setNewOwner({ firstName: '', lastName: '', email: '', phone: '' });
      await refreshOwners(); // Refresh the list
    } catch (error) {
      console.error('Failed to create owner:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setNewOwner({ firstName: '', lastName: '', email: '', phone: '' });
  };

  if (showCreateForm) {
    return (
      <div className={`owner-select-create ${className}`}>
        <form onSubmit={handleCreateOwner} className="create-owner-form">
          <h4>Create New Owner</h4>
          <div className="form-row">
            <input
              type="text"
              placeholder="First Name *"
              value={newOwner.firstName}
              onChange={(e) => setNewOwner({ ...newOwner, firstName: e.target.value })}
              required
              disabled={isCreating}
            />
            <input
              type="text"
              placeholder="Last Name *"
              value={newOwner.lastName}
              onChange={(e) => setNewOwner({ ...newOwner, lastName: e.target.value })}
              required
              disabled={isCreating}
            />
          </div>
          <div className="form-row">
            <input
              type="email"
              placeholder="Email"
              value={newOwner.email || ''}
              onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
              disabled={isCreating}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newOwner.phone || ''}
              onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
              disabled={isCreating}
            />
          </div>
          <div className="form-actions">
            <button
              type="submit"
              disabled={isCreating || !newOwner.firstName.trim() || !newOwner.lastName.trim()}
              className="btn btn-primary"
            >
              {isCreating ? <LoadingSpinner size="small" /> : 'Create Owner'}
            </button>
            <button
              type="button"
              onClick={handleCancelCreate}
              disabled={isCreating}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner size="small" message="Loading owners..." />;
  }

  if (error) {
    return <div className="error-message">Error loading owners: {error}</div>;
  }

  return (
    <select
      value={value || ''}
      onChange={handleSelectChange}
      className={`owner-select ${className}`}
      required={required}
    >
      <option value="">{placeholder}</option>
      {owners.map((owner) => (
        <option key={owner.id} value={owner.id}>
          {owner.firstName} {owner.lastName}
          {owner.email && ` (${owner.email})`}
        </option>
      ))}
      {allowCreate && onCreateOwner && (
        <option value="create-new">+ Create New Owner</option>
      )}
    </select>
  );
};

export default OwnerSelect;