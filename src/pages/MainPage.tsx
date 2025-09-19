/**
 * Main page with dual-mode view: Animals and Households
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PatientForm,
  HouseholdSearch,
  ToastContainer,
  ViewToggle,
  SearchView
} from '../components';
import {
  usePatients,
  useToast,
  useViewState,
  useHouseholds
} from '../hooks';
import { ViewProvider } from '../contexts';
import { PatientWithOwners, CreatePatientInput, UpdatePatientInput, HouseholdSearchResult } from '../types';
import { HouseholdService } from '../services';

const MainPageContent: React.FC = () => {
  const navigate = useNavigate();
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showHouseholdForm, setShowHouseholdForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientWithOwners | null>(null);

  // Hooks
  const { patients, loading: patientsLoading, error: patientsError, createPatient, updatePatient, deletePatient } = usePatients();
  const { households, loading: householdsLoading, error: householdsError, refreshHouseholds } = useHouseholds();
  const { toasts, removeToast, showSuccess, showError } = useToast();

  // View state management
  const {
    currentView,
    isLoading: viewLoading,
    setCurrentView,
    householdSearchState,
    currentSearchState,
    updateAnimalSearch,
    updateHouseholdSearch,
    clearCurrentSearch,
    isAnimalView,
  } = useViewState();

  // Determine loading and error states based on current view
  const loading = isAnimalView ? patientsLoading : householdsLoading;
  const error = isAnimalView ? patientsError : householdsError;

  // Search handlers
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (isAnimalView) {
      // Handle animal search
      if (!searchQuery || searchQuery.trim().length < 2) {
        updateAnimalSearch('', [], false);
        return;
      }

      updateAnimalSearch(searchQuery, [], true);
      try {
        // TODO: Implement actual animal search with backend
        // For now, filter existing patients
        const filtered = patients.filter(p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.species?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.breed?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        updateAnimalSearch(searchQuery, filtered, false);
      } catch (error) {
        console.error('Search failed:', error);
        updateAnimalSearch(searchQuery, [], false);
      }
    } else {
      // Handle household search
      if (!searchQuery || searchQuery.trim().length < 2) {
        updateHouseholdSearch('', [], false);
        return;
      }

      updateHouseholdSearch(searchQuery, [], true);
      try {
        const results = await HouseholdService.searchHouseholdsSimple(searchQuery);
        updateHouseholdSearch(searchQuery, results, false);
      } catch (error) {
        console.error('Household search failed:', error);
        updateHouseholdSearch(searchQuery, [], false);
      }
    }
  }, [isAnimalView, updateAnimalSearch, updateHouseholdSearch, patients]);

  const handleClearSearch = useCallback(() => {
    clearCurrentSearch();
  }, [clearCurrentSearch]);

  // Animal/Patient handlers
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

  // Household handlers
  const handleCreateHousehold = () => {
    setShowHouseholdForm(true);
  };

  const handleEditHousehold = (household: HouseholdSearchResult) => {
    // View-only for now
    console.log('View household:', household);
    showError('Not Available', 'Household editing is not available');
  };

  const handleDeleteHousehold = async (household: HouseholdSearchResult) => {
    showError('Not Available', 'Household deletion is not available');
  };

  const handleHouseholdFormSubmit = async (householdData: any) => {
    try {
      // TODO: Implement proper household creation with multiple people
      // For now, create as owner using the first person
      if (householdData.people && householdData.people[0]) {
        const firstPerson = householdData.people[0];
        const ownerData = {
          firstName: firstPerson.firstName,
          lastName: firstPerson.lastName,
          email: firstPerson.email || '',
          phone: firstPerson.phone || '',
          address: householdData.address || ''
        };

        // Use the owner service to create
        const response = await HouseholdService.createHousehold({
          householdName: householdData.householdName,
          firstName: ownerData.firstName,
          lastName: ownerData.lastName,
          email: ownerData.email,
          phone: ownerData.phone,
          address: ownerData.address
        });

        showSuccess('Household Created', `${householdData.householdName} has been created successfully.`);
        setShowHouseholdForm(false);

        // Refresh the households list
        await refreshHouseholds();
      }
    } catch (error: any) {
      showError('Creation Failed', error?.message || 'Failed to create household');
    }
  };

  const handleHouseholdFormCancel = () => {
    setShowHouseholdForm(false);
  };


  const handleFormSubmit = async (data: CreatePatientInput | UpdatePatientInput) => {
    try {
      if (editingPatient) {
        // Update existing patient
        await updatePatient(editingPatient.id, data as UpdatePatientInput);
        showSuccess('Patient Updated', `${(data as UpdatePatientInput).name || editingPatient.name} has been updated successfully.`);
      } else {
        // Create new patient
        await createPatient(data as CreatePatientInput);
        showSuccess('Patient Created', `${(data as CreatePatientInput).name} has been added successfully.`);
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

  const handleItemClick = (item: PatientWithOwners | HouseholdSearchResult) => {
    if (isAnimalView) {
      const patient = item as PatientWithOwners;
      navigate(`/patients/${patient.id}`);
    } else {
      const household = item as HouseholdSearchResult;
      // TODO: Navigate to household detail page
      console.log('Navigate to household:', household);
    }
  };

  // Show household form if creating household
  if (showHouseholdForm) {
    return (
      <div className="main-page">
        <div className="page-header">
          <h1>Veterinary Clinic Manager</h1>
        </div>

        <div className="page-content">
          <HouseholdSearch
            value={undefined}
            onChange={() => {}}
            onCreateHousehold={handleHouseholdFormSubmit}
            onCancel={handleHouseholdFormCancel}
            startInCreateMode={true}
            className="standalone-household-form"
          />
        </div>

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  // Show patient form if editing/creating patient
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
            Manage {currentView === 'animal' ? 'patient records' : 'household information'}
          </p>
        </div>

        <div className="header-actions">
          <ViewToggle
            currentView={currentView}
            isLoading={viewLoading}
            onViewChange={setCurrentView}
            className="view-toggle-header"
          />

          <button
            onClick={isAnimalView ? handleCreatePatient : handleCreateHousehold}
            className="btn btn-primary"
            disabled={viewLoading}
          >
            Add New {isAnimalView ? 'Patient' : 'Household'}
          </button>
        </div>
      </div>

      <div className="page-content">
        <SearchView
          mode={currentView}
          searchState={currentSearchState}
          allItems={isAnimalView ? patients : households}
          loading={loading}
          error={error}
          onSearch={handleSearch}
          onClear={handleClearSearch}
          onItemClick={handleItemClick}
          onEditItem={isAnimalView ?
            (item: PatientWithOwners | HouseholdSearchResult) => handleEditPatient(item as PatientWithOwners) :
            (item: PatientWithOwners | HouseholdSearchResult) => handleEditHousehold(item as HouseholdSearchResult)
          }
          onDeleteItem={isAnimalView ?
            (item: PatientWithOwners | HouseholdSearchResult) => handleDeletePatient(item as PatientWithOwners) :
            (item: PatientWithOwners | HouseholdSearchResult) => handleDeleteHousehold(item as HouseholdSearchResult)
          }
          onCreateItem={isAnimalView ? handleCreatePatient : handleCreateHousehold}
        />
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

// Main component with ViewProvider wrapper
export const MainPage: React.FC = () => {
  return (
    <ViewProvider>
      <MainPageContent />
    </ViewProvider>
  );
};

export default MainPage;