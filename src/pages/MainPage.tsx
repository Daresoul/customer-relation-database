/**
 * Main page with patient list and search functionality
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PatientList,
  SearchBar,
  PatientForm,
  LoadingSpinner,
  ToastContainer
} from '../components';
import {
  usePatients,
  useSearch,
  useToast,
  useOwners
} from '../hooks';
import { PatientWithOwners, CreatePatientInput } from '../types';

export const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientWithOwners | null>(null);

  // Hooks
  const { patients, loading, error, createPatient, updatePatient, deletePatient } = usePatients();
  const { createOwner } = useOwners();
  const {
    query,
    results: searchResults,
    loading: searchLoading,
    hasQuery,
    updateQuery,
    clearSearch
  } = useSearch();
  const { toasts, removeToast, showSuccess, showError } = useToast();

  // Determine which patients to display
  const displayPatients = hasQuery ? searchResults : patients;
  const isLoading = hasQuery ? searchLoading : loading;

  const handleSearch = (searchQuery: string) => {
    updateQuery(searchQuery);
  };

  const handleClearSearch = () => {
    clearSearch();
  };

  const handleCreatePatient = () => {
    setEditingPatient(null);
    setShowPatientForm(true);
  };

  const handleEditPatient = (patient: PatientWithOwners) => {
    setEditingPatient(patient);
    setShowPatientForm(true);
  };

  const handleDeletePatient = async (patient: PatientWithOwners) => {
    if (!window.confirm(`Are you sure you want to delete ${patient.name}?`)) {
      return;
    }

    try {
      await deletePatient(patient.id);
      showSuccess('Patient Deleted', `${patient.name} has been deleted successfully.`);
    } catch (error: any) {
      showError('Delete Failed', error?.message || 'Failed to delete patient');
    }
  };

  const handleFormSubmit = async (data: CreatePatientInput) => {
    try {
      if (editingPatient) {
        // Update existing patient
        await updatePatient(editingPatient.id, data);
        showSuccess('Patient Updated', `${data.name} has been updated successfully.`);
      } else {
        // Create new patient
        await createPatient(data);
        showSuccess('Patient Created', `${data.name} has been added successfully.`);
      }
      setShowPatientForm(false);
      setEditingPatient(null);
    } catch (error: any) {
      showError(
        editingPatient ? 'Update Failed' : 'Creation Failed',
        error?.message || `Failed to ${editingPatient ? 'update' : 'create'} patient`
      );
    }
  };

  const handleFormCancel = () => {
    setShowPatientForm(false);
    setEditingPatient(null);
  };

  const handlePatientClick = (patient: PatientWithOwners) => {
    navigate(`/patients/${patient.id}`);
  };

  if (showPatientForm) {
    return (
      <div className="main-page">
        <div className="page-header">
          <h1>Veterinary Clinic Manager</h1>
        </div>

        <div className="page-content">
          <PatientForm
            patient={editingPatient || undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            onCreateOwner={createOwner}
          />
        </div>

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  return (
    <div className="main-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Veterinary Clinic Manager</h1>
          <p className="header-subtitle">
            Manage patient records and owner information
          </p>
        </div>

        <div className="header-actions">
          <button
            onClick={handleCreatePatient}
            className="btn btn-primary"
          >
            Add New Patient
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="search-section">
          <SearchBar
            placeholder="Search patients by name, species, breed, or owner..."
            onSearch={handleSearch}
            onClear={handleClearSearch}
            initialValue={query}
          />

          {hasQuery && (
            <div className="search-info">
              <p>
                {searchLoading ? (
                  'Searching...'
                ) : (
                  `Found ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`
                )}
              </p>
              {!searchLoading && searchResults.length > 0 && (
                <button
                  onClick={handleClearSearch}
                  className="btn btn-sm btn-secondary"
                >
                  Show All Patients
                </button>
              )}
            </div>
          )}
        </div>

        <div className="patients-section">
          {error && !hasQuery && (
            <div className="error-message">
              <h3>Error Loading Patients</h3>
              <p>{error}</p>
            </div>
          )}

          <PatientList
            patients={displayPatients}
            loading={isLoading}
            error={hasQuery ? null : error}
            onEditPatient={handleEditPatient}
            onDeletePatient={handleDeletePatient}
            onCreatePatient={handleCreatePatient}
          />
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default MainPage;