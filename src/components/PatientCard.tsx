/**
 * Individual patient card component
 */

import React from 'react';
import { PatientWithOwners } from '../types';
import { Link } from 'react-router-dom';

interface PatientCardProps {
  patient: PatientWithOwners;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

export const PatientCard: React.FC<PatientCardProps> = ({
  patient,
  onEdit,
  onDelete,
  className = ''
}) => {
  const primaryOwner = patient.owners.find(owner => owner.isPrimary);
  const otherOwners = patient.owners.filter(owner => !owner.isPrimary);

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

  const age = calculateAge(patient.dateOfBirth);

  return (
    <div className={`patient-card ${!patient.isActive ? 'inactive' : ''} ${className}`}>
      <div className="patient-card-header">
        <div className="patient-basic-info">
          <h3 className="patient-name">
            <Link to={`/patients/${patient.id}`}>{patient.name}</Link>
          </h3>
          <p className="patient-species">
            {patient.species}
            {patient.breed && ` • ${patient.breed}`}
            {age !== null && ` • ${age} years old`}
          </p>
        </div>

        <div className="patient-card-actions">
          {onEdit && (
            <button
              onClick={onEdit}
              className="btn btn-sm btn-secondary"
              title="Edit patient"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="btn btn-sm btn-danger"
              title="Delete patient"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="patient-card-body">
        <div className="patient-details">
          {patient.gender && (
            <span className="patient-detail">
              <strong>Gender:</strong> {patient.gender}
            </span>
          )}
          {patient.color && (
            <span className="patient-detail">
              <strong>Color:</strong> {patient.color}
            </span>
          )}
          {patient.weight && (
            <span className="patient-detail">
              <strong>Weight:</strong> {patient.weight} lbs
            </span>
          )}
          {patient.microchipId && (
            <span className="patient-detail">
              <strong>Microchip:</strong> {patient.microchipId}
            </span>
          )}
        </div>

        {patient.owners.length > 0 && (
          <div className="patient-owners">
            <h4>Owners:</h4>
            {primaryOwner && (
              <div className="owner-info primary-owner">
                <Link to={`/owners/${primaryOwner.id}`} className="owner-name">
                  {primaryOwner.firstName} {primaryOwner.lastName}
                </Link>
                <span className="owner-relationship">
                  Primary {primaryOwner.relationshipType}
                </span>
                {primaryOwner.phone && (
                  <span className="owner-phone">{primaryOwner.phone}</span>
                )}
              </div>
            )}

            {otherOwners.map((owner) => (
              <div key={owner.id} className="owner-info">
                <Link to={`/owners/${owner.id}`} className="owner-name">
                  {owner.firstName} {owner.lastName}
                </Link>
                <span className="owner-relationship">
                  {owner.relationshipType}
                </span>
                {owner.phone && (
                  <span className="owner-phone">{owner.phone}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {patient.notes && (
          <div className="patient-notes">
            <strong>Notes:</strong>
            <p>{patient.notes}</p>
          </div>
        )}
      </div>

      <div className="patient-card-footer">
        <small className="text-muted">
          Created: {formatDate(patient.createdAt)}
          {patient.updatedAt !== patient.createdAt && (
            <> • Updated: {formatDate(patient.updatedAt)}</>
          )}
        </small>
      </div>
    </div>
  );
};

export default PatientCard;