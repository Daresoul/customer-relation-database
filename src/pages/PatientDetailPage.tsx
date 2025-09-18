/**
 * Detailed patient view page
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LoadingSpinner,
  ToastContainer,
  OwnerSelect,
  PatientForm
} from '../components';
import {
  usePatients,
  useOwners,
  useToast
} from '../hooks';
import { PatientWithOwners, UpdatePatientInput, Owner } from '../types';

export const PatientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientWithOwners | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);

  // Hooks
  const {
    getPatient,
    updatePatient,
    deletePatient,
    addPatientOwner,
    removePatientOwner,
    setPrimaryOwner
  } = usePatients();
  const { createOwner } = useOwners();
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const patientId = parseInt(id || '0', 10);

  useEffect(() => {
    if (!patientId) {
      setError('Invalid patient ID');
      setLoading(false);
      return;
    }

    loadPatient();
  }, [patientId]);

  const loadPatient = async () => {
    try {
      setLoading(true);
      setError(null);
      const patientData = await getPatient(patientId);
      setPatient(patientData);
    } catch (error: any) {
      setError(error?.message || 'Failed to load patient');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePatient = async (data: UpdatePatientInput) => {
    try {
      await updatePatient(patientId, data);
      showSuccess('Patient Updated', 'Patient information has been updated successfully.');
      setShowEditForm(false);
      await loadPatient(); // Reload to get fresh data
    } catch (error: any) {
      showError('Update Failed', error?.message || 'Failed to update patient');
    }
  };

  const handleDeletePatient = async () => {
    if (!patient) return;

    if (!window.confirm(`Are you sure you want to delete ${patient.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deletePatient(patientId);
      showSuccess('Patient Deleted', `${patient.name} has been deleted successfully.`);
      navigate('/');
    } catch (error: any) {
      showError('Delete Failed', error?.message || 'Failed to delete patient');
    }
  };

  const handleAddOwner = async () => {
    if (!selectedOwnerId) return;

    try {
      await addPatientOwner(patientId, selectedOwnerId, false, 'Owner');
      showSuccess('Owner Added', 'Owner has been associated with this patient.');
      setShowAddOwner(false);
      setSelectedOwnerId(null);
      await loadPatient();
    } catch (error: any) {
      showError('Add Owner Failed', error?.message || 'Failed to add owner to patient');
    }
  };

  const handleRemoveOwner = async (ownerId: number, ownerName: string) => {
    if (!window.confirm(`Remove ${ownerName} from this patient?`)) {
      return;
    }

    try {
      await removePatientOwner(patientId, ownerId);
      showSuccess('Owner Removed', `${ownerName} has been removed from this patient.`);
      await loadPatient();
    } catch (error: any) {
      showError('Remove Owner Failed', error?.message || 'Failed to remove owner from patient');
    }
  };

  const handleSetPrimaryOwner = async (ownerId: number, ownerName: string) => {
    try {
      await setPrimaryOwner(patientId, ownerId);
      showSuccess('Primary Owner Set', `${ownerName} is now the primary owner.`);
      await loadPatient();
    } catch (error: any) {
      showError('Set Primary Failed', error?.message || 'Failed to set primary owner');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const calculateAge = (dateOfBirth?: string) => {
    if (!dateOfBirth) return null;

    try {
      const birth = new Date(dateOfBirth);
      const today = new Date();
      const ageInYears = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        return ageInYears - 1;
      }

      return ageInYears;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="patient-detail-page">
        <LoadingSpinner size="large" message="Loading patient details..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="patient-detail-page">
        <div className="error-message">
          <h2>Error Loading Patient</h2>
          <p>{error}</p>
          <Link to="/" className="btn btn-primary">Back to Patients</Link>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="patient-detail-page">
        <div className="error-message">
          <h2>Patient Not Found</h2>
          <p>The requested patient could not be found.</p>
          <Link to="/" className="btn btn-primary">Back to Patients</Link>
        </div>
      </div>
    );
  }

  if (showEditForm) {
    return (
      <div className="patient-detail-page">
        <div className="page-header">
          <h1>Edit Patient</h1>
        </div>

        <PatientForm
          patient={patient}
          onSubmit={handleUpdatePatient}
          onCancel={() => setShowEditForm(false)}
        />

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  const age = calculateAge(patient.dateOfBirth);
  const primaryOwner = patient.owners.find(owner => owner.isPrimary);
  const otherOwners = patient.owners.filter(owner => !owner.isPrimary);

  return (
    <div className="patient-detail-page">
      <div className="page-header">
        <div className="header-content">
          <Link to="/" className="back-link">← Back to Patients</Link>
          <h1>{patient.name}</h1>
          <p className="patient-subtitle">
            {patient.species}
            {patient.breed && ` • ${patient.breed}`}
            {age !== null && ` • ${age} years old`}
          </p>
        </div>

        <div className="header-actions">
          <button
            onClick={() => setShowEditForm(true)}
            className="btn btn-secondary"
          >
            Edit Patient
          </button>
          <button
            onClick={handleDeletePatient}
            className="btn btn-danger"
          >
            Delete Patient
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="patient-detail-grid">
          {/* Basic Information */}
          <div className="detail-section">
            <h2>Basic Information</h2>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Name:</label>
                <span>{patient.name}</span>
              </div>
              <div className="detail-item">
                <label>Species:</label>
                <span>{patient.species}</span>
              </div>
              {patient.breed && (
                <div className="detail-item">
                  <label>Breed:</label>
                  <span>{patient.breed}</span>
                </div>
              )}
              {patient.gender && (
                <div className="detail-item">
                  <label>Gender:</label>
                  <span>{patient.gender}</span>
                </div>
              )}
              {patient.dateOfBirth && (
                <div className="detail-item">
                  <label>Date of Birth:</label>
                  <span>{formatDate(patient.dateOfBirth)}</span>
                </div>
              )}
              {patient.color && (
                <div className="detail-item">
                  <label>Color:</label>
                  <span>{patient.color}</span>
                </div>
              )}
              {patient.weight && (
                <div className="detail-item">
                  <label>Weight:</label>
                  <span>{patient.weight} lbs</span>
                </div>
              )}
              {patient.microchipId && (
                <div className="detail-item">
                  <label>Microchip ID:</label>
                  <span>{patient.microchipId}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Status:</label>
                <span className={`status ${patient.isActive ? 'active' : 'inactive'}`}>
                  {patient.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Owners Section */}
          <div className="detail-section">
            <div className="section-header">
              <h2>Owners</h2>
              <button
                onClick={() => setShowAddOwner(true)}
                className="btn btn-sm btn-primary"
              >
                Add Owner
              </button>
            </div>

            {patient.owners.length === 0 ? (
              <p className="no-data">No owners associated with this patient.</p>
            ) : (
              <div className="owners-list">
                {primaryOwner && (
                  <div className="owner-card primary">
                    <div className="owner-info">
                      <h3>
                        <Link to={`/owners/${primaryOwner.id}`}>
                          {primaryOwner.firstName} {primaryOwner.lastName}
                        </Link>
                        <span className="primary-badge">Primary</span>
                      </h3>
                      <p className="relationship">{primaryOwner.relationshipType}</p>
                      {primaryOwner.phone && <p className="contact">📞 {primaryOwner.phone}</p>}
                      {primaryOwner.email && <p className="contact">✉️ {primaryOwner.email}</p>}
                    </div>
                    <div className="owner-actions">
                      <button
                        onClick={() => handleRemoveOwner(primaryOwner.id, `${primaryOwner.firstName} ${primaryOwner.lastName}`)}
                        className="btn btn-sm btn-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {otherOwners.map((owner) => (
                  <div key={owner.id} className="owner-card">
                    <div className="owner-info">
                      <h3>
                        <Link to={`/owners/${owner.id}`}>
                          {owner.firstName} {owner.lastName}
                        </Link>
                      </h3>
                      <p className="relationship">{owner.relationshipType}</p>
                      {owner.phone && <p className="contact">📞 {owner.phone}</p>}
                      {owner.email && <p className="contact">✉️ {owner.email}</p>}
                    </div>
                    <div className="owner-actions">
                      <button
                        onClick={() => handleSetPrimaryOwner(owner.id, `${owner.firstName} ${owner.lastName}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        Set Primary
                      </button>
                      <button
                        onClick={() => handleRemoveOwner(owner.id, `${owner.firstName} ${owner.lastName}`)}
                        className="btn btn-sm btn-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddOwner && (
              <div className="add-owner-form">
                <h3>Add Owner</h3>
                <div className="form-row">
                  <OwnerSelect
                    value={selectedOwnerId || undefined}
                    onChange={setSelectedOwnerId}
                    allowCreate={true}
                    onCreateOwner={createOwner}
                    placeholder="Select an owner to add..."
                  />
                </div>
                <div className="form-actions">
                  <button
                    onClick={handleAddOwner}
                    disabled={!selectedOwnerId}
                    className="btn btn-primary"
                  >
                    Add Owner
                  </button>
                  <button
                    onClick={() => {
                      setShowAddOwner(false);
                      setSelectedOwnerId(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notes Section */}
          {patient.notes && (
            <div className="detail-section">
              <h2>Notes</h2>
              <p className="notes-content">{patient.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="detail-section">
            <h2>Record Information</h2>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created:</label>
                <span>{formatDate(patient.createdAt)}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{formatDate(patient.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default PatientDetailPage;