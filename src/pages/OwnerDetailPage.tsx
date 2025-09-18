/**
 * Detailed owner view page with their patients
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LoadingSpinner,
  ToastContainer,
  OwnerForm,
  PatientCard
} from '../components';
import {
  useOwners,
  useToast
} from '../hooks';
import { OwnerWithPatients, UpdateOwnerInput } from '../types';

export const OwnerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [owner, setOwner] = useState<OwnerWithPatients | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Hooks
  const {
    getOwnerWithPatients,
    updateOwner,
    deleteOwner,
    canDeleteOwner
  } = useOwners();
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const ownerId = parseInt(id || '0', 10);

  useEffect(() => {
    if (!ownerId) {
      setError('Invalid owner ID');
      setLoading(false);
      return;
    }

    loadOwner();
  }, [ownerId]);

  const loadOwner = async () => {
    try {
      setLoading(true);
      setError(null);
      const ownerData = await getOwnerWithPatients(ownerId);
      setOwner(ownerData);
    } catch (error: any) {
      setError(error?.message || 'Failed to load owner');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOwner = async (data: UpdateOwnerInput) => {
    try {
      await updateOwner(ownerId, data);
      showSuccess('Owner Updated', 'Owner information has been updated successfully.');
      setShowEditForm(false);
      await loadOwner(); // Reload to get fresh data
    } catch (error: any) {
      showError('Update Failed', error?.message || 'Failed to update owner');
    }
  };

  const handleDeleteOwner = async () => {
    if (!owner) return;

    // Check if owner can be deleted
    try {
      const canDelete = await canDeleteOwner(ownerId);
      if (!canDelete) {
        showError(
          'Cannot Delete Owner',
          'This owner has associated patients and cannot be deleted. Remove all patient associations first.'
        );
        return;
      }
    } catch (error: any) {
      showError('Delete Check Failed', error?.message || 'Failed to check if owner can be deleted');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${owner.firstName} ${owner.lastName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteOwner(ownerId);
      showSuccess('Owner Deleted', `${owner.firstName} ${owner.lastName} has been deleted successfully.`);
      navigate('/');
    } catch (error: any) {
      showError('Delete Failed', error?.message || 'Failed to delete owner');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatAddress = (owner: OwnerWithPatients) => {
    const parts = [owner.address, owner.city, owner.state, owner.zipCode].filter(Boolean);
    return parts.join(', ');
  };

  if (loading) {
    return (
      <div className="owner-detail-page">
        <LoadingSpinner size="large" message="Loading owner details..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="owner-detail-page">
        <div className="error-message">
          <h2>Error Loading Owner</h2>
          <p>{error}</p>
          <Link to="/" className="btn btn-primary">Back to Patients</Link>
        </div>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="owner-detail-page">
        <div className="error-message">
          <h2>Owner Not Found</h2>
          <p>The requested owner could not be found.</p>
          <Link to="/" className="btn btn-primary">Back to Patients</Link>
        </div>
      </div>
    );
  }

  if (showEditForm) {
    return (
      <div className="owner-detail-page">
        <div className="page-header">
          <h1>Edit Owner</h1>
        </div>

        <OwnerForm
          owner={owner}
          onSubmit={handleUpdateOwner}
          onCancel={() => setShowEditForm(false)}
        />

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  const fullAddress = formatAddress(owner);

  return (
    <div className="owner-detail-page">
      <div className="page-header">
        <div className="header-content">
          <Link to="/" className="back-link">← Back to Patients</Link>
          <h1>{owner.firstName} {owner.lastName}</h1>
          <p className="owner-subtitle">
            {owner.patients.length} patient{owner.patients.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="header-actions">
          <button
            onClick={() => setShowEditForm(true)}
            className="btn btn-secondary"
          >
            Edit Owner
          </button>
          <button
            onClick={handleDeleteOwner}
            className="btn btn-danger"
            disabled={owner.patients.length > 0}
            title={owner.patients.length > 0 ? 'Cannot delete owner with associated patients' : 'Delete owner'}
          >
            Delete Owner
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="owner-detail-grid">
          {/* Contact Information */}
          <div className="detail-section">
            <h2>Contact Information</h2>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Name:</label>
                <span>{owner.firstName} {owner.lastName}</span>
              </div>
              {owner.email && (
                <div className="detail-item">
                  <label>Email:</label>
                  <span>
                    <a href={`mailto:${owner.email}`}>{owner.email}</a>
                  </span>
                </div>
              )}
              {owner.phone && (
                <div className="detail-item">
                  <label>Phone:</label>
                  <span>
                    <a href={`tel:${owner.phone}`}>{owner.phone}</a>
                  </span>
                </div>
              )}
              {fullAddress && (
                <div className="detail-item">
                  <label>Address:</label>
                  <span>{fullAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Emergency Contact */}
          {(owner.emergencyContact || owner.emergencyPhone) && (
            <div className="detail-section">
              <h2>Emergency Contact</h2>
              <div className="detail-grid">
                {owner.emergencyContact && (
                  <div className="detail-item">
                    <label>Contact Person:</label>
                    <span>{owner.emergencyContact}</span>
                  </div>
                )}
                {owner.emergencyPhone && (
                  <div className="detail-item">
                    <label>Emergency Phone:</label>
                    <span>
                      <a href={`tel:${owner.emergencyPhone}`}>{owner.emergencyPhone}</a>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Patients Section */}
          <div className="detail-section patients-section">
            <h2>Patients ({owner.patients.length})</h2>

            {owner.patients.length === 0 ? (
              <div className="no-patients">
                <p>This owner has no associated patients.</p>
                <Link to="/" className="btn btn-primary">Add New Patient</Link>
              </div>
            ) : (
              <div className="patients-grid">
                {owner.patients.map((patient) => (
                  <div key={patient.id} className="patient-summary-card">
                    <Link to={`/patients/${patient.id}`} className="patient-link">
                      <h3>{patient.name}</h3>
                      <p className="patient-species">
                        {patient.species}
                        {patient.breed && ` • ${patient.breed}`}
                      </p>
                      <div className="patient-relationship">
                        <span className={`relationship-badge ${patient.isPrimary ? 'primary' : ''}`}>
                          {patient.isPrimary && 'Primary '}{patient.relationshipType}
                        </span>
                      </div>
                      {!patient.isActive && (
                        <span className="inactive-badge">Inactive</span>
                      )}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes Section */}
          {owner.notes && (
            <div className="detail-section">
              <h2>Notes</h2>
              <p className="notes-content">{owner.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="detail-section">
            <h2>Record Information</h2>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created:</label>
                <span>{formatDate(owner.createdAt)}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{formatDate(owner.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default OwnerDetailPage;