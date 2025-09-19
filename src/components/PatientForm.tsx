/**
 * Patient form component for creating and editing patients
 */

import React, { useState, useEffect } from 'react';
import { Patient, CreatePatientInput, UpdatePatientInput } from '../types';
import HouseholdSearch from './HouseholdSearch';
import LoadingSpinner from './LoadingSpinner';

interface PatientFormProps {
  patient?: Patient;
  onSubmit: (data: CreatePatientInput | UpdatePatientInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export const PatientForm: React.FC<PatientFormProps> = ({
  patient,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
  className = ''
}) => {
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    breed: '',
    dateOfBirth: '',
    color: '',
    gender: '' as '' | 'Male' | 'Female' | 'Unknown',
    weight: '',
    microchipId: '',
    notes: '',
    householdId: null as number | null,
    isActive: true
  });

  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (patient) {
      setFormData({
        name: patient.name || '',
        species: patient.species || '',
        breed: patient.breed || '',
        dateOfBirth: patient.dateOfBirth || '',
        color: patient.color || '',
        gender: patient.gender || '',
        weight: patient.weight?.toString() || '',
        microchipId: patient.microchipId || '',
        notes: patient.notes || '',
        householdId: null, // Household selection is separate for edits
        isActive: patient.isActive
      });
    }
  }, [patient]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      errors.name = 'Patient name is required';
    }

    if (!formData.species.trim()) {
      errors.species = 'Species is required';
    }

    if (formData.weight && isNaN(parseFloat(formData.weight))) {
      errors.weight = 'Weight must be a valid number';
    }

    if (formData.dateOfBirth) {
      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      if (birthDate > today) {
        errors.dateOfBirth = 'Date of birth cannot be in the future';
      }
    }

    // For new patients, require a household
    if (!patient && !formData.householdId) {
      errors.householdId = 'Please select or create a household for the new patient';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const submitData: CreatePatientInput | UpdatePatientInput = {
        name: formData.name.trim(),
        species: formData.species.trim(),
        breed: formData.breed.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        color: formData.color.trim() || undefined,
        gender: formData.gender || undefined,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        microchipId: formData.microchipId.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        ...(patient ? { isActive: formData.isActive } : { ownerId: formData.householdId })
      };

      await onSubmit(submitData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`patient-form ${className}`}>
      <div className="form-header">
        <h2>{patient ? 'Edit Patient' : 'Add New Patient'}</h2>
      </div>

      {error && (
        <div className="form-error">
          <p>{error}</p>
        </div>
      )}

      <div className="form-body">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={validationErrors.name ? 'error' : ''}
              disabled={loading}
              required
            />
            {validationErrors.name && (
              <span className="field-error">{validationErrors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="species">Species *</label>
            <input
              id="species"
              type="text"
              value={formData.species}
              onChange={(e) => handleInputChange('species', e.target.value)}
              className={validationErrors.species ? 'error' : ''}
              disabled={loading}
              placeholder="e.g., Dog, Cat, Bird"
              required
            />
            {validationErrors.species && (
              <span className="field-error">{validationErrors.species}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="breed">Breed</label>
            <input
              id="breed"
              type="text"
              value={formData.breed}
              onChange={(e) => handleInputChange('breed', e.target.value)}
              disabled={loading}
              placeholder="e.g., Golden Retriever, Siamese"
            />
          </div>

          <div className="form-group">
            <label htmlFor="gender">Gender</label>
            <select
              id="gender"
              value={formData.gender}
              onChange={(e) => handleInputChange('gender', e.target.value as any)}
              disabled={loading}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="dateOfBirth">Date of Birth</label>
            <input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
              className={validationErrors.dateOfBirth ? 'error' : ''}
              disabled={loading}
            />
            {validationErrors.dateOfBirth && (
              <span className="field-error">{validationErrors.dateOfBirth}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="weight">Weight (lbs)</label>
            <input
              id="weight"
              type="number"
              step="0.1"
              min="0"
              value={formData.weight}
              onChange={(e) => handleInputChange('weight', e.target.value)}
              className={validationErrors.weight ? 'error' : ''}
              disabled={loading}
              placeholder="0.0"
            />
            {validationErrors.weight && (
              <span className="field-error">{validationErrors.weight}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="color">Color</label>
            <input
              id="color"
              type="text"
              value={formData.color}
              onChange={(e) => handleInputChange('color', e.target.value)}
              disabled={loading}
              placeholder="e.g., Brown, Black and White"
            />
          </div>

          <div className="form-group">
            <label htmlFor="microchipId">Microchip ID</label>
            <input
              id="microchipId"
              type="text"
              value={formData.microchipId}
              onChange={(e) => handleInputChange('microchipId', e.target.value)}
              disabled={loading}
              placeholder="15-digit microchip number"
            />
          </div>
        </div>

        {!patient && (
          <div className="form-group">
            <label>Household *</label>
            <HouseholdSearch
              value={formData.householdId || undefined}
              onChange={(householdId) => handleInputChange('householdId', householdId)}
              required
              className={validationErrors.householdId ? 'error' : ''}
            />
            {validationErrors.householdId && (
              <span className="field-error">{validationErrors.householdId}</span>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="Any additional notes about the patient..."
          />
        </div>

        {patient && (
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                disabled={loading}
              />
              Active Patient
            </label>
          </div>
        )}
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
            patient ? 'Update Patient' : 'Create Patient'
          )}
        </button>
      </div>
    </form>
  );
};

export default PatientForm;