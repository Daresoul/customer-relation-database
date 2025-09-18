/**
 * Patient list component with cards
 */

import React from 'react';
import { PatientWithOwners } from '../types';
import PatientCard from './PatientCard';
import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';

interface PatientListProps {
  patients: PatientWithOwners[];
  loading?: boolean;
  error?: string | null;
  onEditPatient?: (patient: PatientWithOwners) => void;
  onDeletePatient?: (patient: PatientWithOwners) => void;
  onCreatePatient?: () => void;
  className?: string;
}

export const PatientList: React.FC<PatientListProps> = ({
  patients,
  loading = false,
  error = null,
  onEditPatient,
  onDeletePatient,
  onCreatePatient,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={`patient-list-loading ${className}`}>
        <LoadingSpinner size="large" message="Loading patients..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`patient-list-error ${className}`}>
        <div className="error-message">
          <h3>Error Loading Patients</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className={`patient-list-empty ${className}`}>
        <EmptyState
          title="No Patients Found"
          message="There are no patients in the database yet. Get started by adding your first patient."
          actionLabel={onCreatePatient ? "Add First Patient" : undefined}
          onAction={onCreatePatient}
          icon={<span style={{ fontSize: '4rem' }}>🐕</span>}
        />
      </div>
    );
  }

  return (
    <div className={`patient-list ${className}`}>
      <div className="patient-list-header">
        <h2>Patients ({patients.length})</h2>
        {onCreatePatient && (
          <button
            onClick={onCreatePatient}
            className="btn btn-primary"
          >
            Add New Patient
          </button>
        )}
      </div>

      <div className="patient-cards-grid">
        {patients.map((patient) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            onEdit={onEditPatient ? () => onEditPatient(patient) : undefined}
            onDelete={onDeletePatient ? () => onDeletePatient(patient) : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default PatientList;