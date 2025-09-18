/**
 * Owner form component for creating and editing owners
 */

import React, { useState, useEffect } from 'react';
import { Owner, CreateOwnerInput, UpdateOwnerInput } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface OwnerFormProps {
  owner?: Owner;
  onSubmit: (data: CreateOwnerInput | UpdateOwnerInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export const OwnerForm: React.FC<OwnerFormProps> = ({
  owner,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
  className = ''
}) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    emergencyContact: '',
    emergencyPhone: '',
    notes: ''
  });

  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (owner) {
      setFormData({
        firstName: owner.firstName || '',
        lastName: owner.lastName || '',
        email: owner.email || '',
        phone: owner.phone || '',
        address: owner.address || '',
        city: owner.city || '',
        state: owner.state || '',
        zipCode: owner.zipCode || '',
        emergencyContact: owner.emergencyContact || '',
        emergencyPhone: owner.emergencyPhone || '',
        notes: owner.notes || ''
      });
    }
  }, [owner]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }

    if (formData.email && !isValidEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (formData.phone && !isValidPhoneNumber(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (formData.emergencyPhone && !isValidPhoneNumber(formData.emergencyPhone)) {
      errors.emergencyPhone = 'Please enter a valid emergency phone number';
    }

    if (formData.zipCode && !isValidZipCode(formData.zipCode)) {
      errors.zipCode = 'Please enter a valid ZIP code';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidPhoneNumber = (phone: string): boolean => {
    // Basic phone validation - accepts various formats
    return /^[\+]?[1-9][\d]{0,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''));
  };

  const isValidZipCode = (zipCode: string): boolean => {
    // US ZIP code validation (5 digits or 5+4)
    return /^\d{5}(-\d{4})?$/.test(zipCode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const submitData: CreateOwnerInput | UpdateOwnerInput = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        zipCode: formData.zipCode.trim() || undefined,
        emergencyContact: formData.emergencyContact.trim() || undefined,
        emergencyPhone: formData.emergencyPhone.trim() || undefined,
        notes: formData.notes.trim() || undefined
      };

      await onSubmit(submitData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`owner-form ${className}`}>
      <div className="form-header">
        <h2>{owner ? 'Edit Owner' : 'Add New Owner'}</h2>
      </div>

      {error && (
        <div className="form-error">
          <p>{error}</p>
        </div>
      )}

      <div className="form-body">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="firstName">First Name *</label>
            <input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              className={validationErrors.firstName ? 'error' : ''}
              disabled={loading}
              required
            />
            {validationErrors.firstName && (
              <span className="field-error">{validationErrors.firstName}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name *</label>
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              className={validationErrors.lastName ? 'error' : ''}
              disabled={loading}
              required
            />
            {validationErrors.lastName && (
              <span className="field-error">{validationErrors.lastName}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={validationErrors.email ? 'error' : ''}
              disabled={loading}
              placeholder="owner@example.com"
            />
            {validationErrors.email && (
              <span className="field-error">{validationErrors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className={validationErrors.phone ? 'error' : ''}
              disabled={loading}
              placeholder="(555) 123-4567"
            />
            {validationErrors.phone && (
              <span className="field-error">{validationErrors.phone}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="address">Address</label>
          <input
            id="address"
            type="text"
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            disabled={loading}
            placeholder="123 Main Street"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="city">City</label>
            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => handleInputChange('city', e.target.value)}
              disabled={loading}
              placeholder="City"
            />
          </div>

          <div className="form-group">
            <label htmlFor="state">State</label>
            <input
              id="state"
              type="text"
              value={formData.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
              disabled={loading}
              placeholder="State"
              maxLength={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="zipCode">ZIP Code</label>
            <input
              id="zipCode"
              type="text"
              value={formData.zipCode}
              onChange={(e) => handleInputChange('zipCode', e.target.value)}
              className={validationErrors.zipCode ? 'error' : ''}
              disabled={loading}
              placeholder="12345"
              maxLength={10}
            />
            {validationErrors.zipCode && (
              <span className="field-error">{validationErrors.zipCode}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="emergencyContact">Emergency Contact</label>
            <input
              id="emergencyContact"
              type="text"
              value={formData.emergencyContact}
              onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
              disabled={loading}
              placeholder="Contact person name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="emergencyPhone">Emergency Phone</label>
            <input
              id="emergencyPhone"
              type="tel"
              value={formData.emergencyPhone}
              onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
              className={validationErrors.emergencyPhone ? 'error' : ''}
              disabled={loading}
              placeholder="(555) 987-6543"
            />
            {validationErrors.emergencyPhone && (
              <span className="field-error">{validationErrors.emergencyPhone}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="Any additional notes about the owner..."
          />
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <LoadingSpinner size="small" />
          ) : (
            owner ? 'Update Owner' : 'Create Owner'
          )}
        </button>
      </div>
    </form>
  );
};

export default OwnerForm;