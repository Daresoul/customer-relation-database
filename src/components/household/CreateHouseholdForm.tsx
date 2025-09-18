import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CreateHouseholdWithPeopleDto,
  CreatePersonWithContactsDto,
  CreateContactDto,
  validateHouseholdDto,
} from '../../types/household';

interface CreateHouseholdFormProps {
  onSubmit: (dto: CreateHouseholdWithPeopleDto) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CreateHouseholdWithPeopleDto>;
}

export const CreateHouseholdForm: React.FC<CreateHouseholdFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
}) => {
  const [householdName, setHouseholdName] = useState(initialData?.household?.householdName || '');
  const [address, setAddress] = useState(initialData?.household?.address || '');
  const [notes, setNotes] = useState(initialData?.household?.notes || '');
  const [people, setPeople] = useState<CreatePersonWithContactsDto[]>(
    initialData?.people || [
      {
        person: { firstName: '', lastName: '', isPrimary: true },
        contacts: [],
      },
    ]
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addPerson = () => {
    if (people.length >= 5) {
      setError('Maximum 5 people per household');
      return;
    }
    setPeople([
      ...people,
      {
        person: { firstName: '', lastName: '', isPrimary: false },
        contacts: [],
      },
    ]);
    setError(null);
  };

  const removePerson = (index: number) => {
    if (people.length <= 1) {
      setError('Household must have at least one person');
      return;
    }
    const newPeople = people.filter((_, i) => i !== index);
    // Ensure at least one person is primary
    if (!newPeople.some(p => p.person.isPrimary)) {
      newPeople[0].person.isPrimary = true;
    }
    setPeople(newPeople);
    setError(null);
  };

  const updatePerson = (index: number, field: keyof CreatePersonWithContactsDto['person'], value: any) => {
    const newPeople = [...people];
    (newPeople[index].person as any)[field] = value;

    // If setting as primary, unset others
    if (field === 'isPrimary' && value === true) {
      newPeople.forEach((p, i) => {
        if (i !== index) p.person.isPrimary = false;
      });
    }

    setPeople(newPeople);
    setError(null);
  };

  const addContact = (personIndex: number) => {
    const newPeople = [...people];
    newPeople[personIndex].contacts.push({
      contactType: 'phone',
      contactValue: '',
      isPrimary: newPeople[personIndex].contacts.length === 0,
    });
    setPeople(newPeople);
  };

  const removeContact = (personIndex: number, contactIndex: number) => {
    const newPeople = [...people];
    newPeople[personIndex].contacts = newPeople[personIndex].contacts.filter(
      (_, i) => i !== contactIndex
    );
    setPeople(newPeople);
  };

  const updateContact = (
    personIndex: number,
    contactIndex: number,
    field: keyof CreateContactDto,
    value: any
  ) => {
    const newPeople = [...people];
    (newPeople[personIndex].contacts[contactIndex] as any)[field] = value;

    // If setting as primary, unset others of same type
    if (field === 'isPrimary' && value === true) {
      const contactType = newPeople[personIndex].contacts[contactIndex].contactType;
      newPeople[personIndex].contacts.forEach((c, i) => {
        if (i !== contactIndex && c.contactType === contactType) {
          c.isPrimary = false;
        }
      });
    }

    setPeople(newPeople);
  };

  // Enhanced validation with field-specific errors
  const validateForm = (): {isValid: boolean, errors: {[key: string]: string}, generalError?: string} => {
    const errors: {[key: string]: string} = {};
    let generalError: string | undefined;

    // Validate people array
    if (people.length === 0) {
      generalError = 'Household must have at least one person';
      return { isValid: false, errors, generalError };
    }

    if (people.length > 5) {
      generalError = 'Household cannot have more than 5 people';
      return { isValid: false, errors, generalError };
    }

    // Check primary person
    const primaryCount = people.filter(p => p.person.isPrimary).length;
    if (primaryCount === 0) {
      generalError = 'Please mark one person as the primary contact';
      return { isValid: false, errors, generalError };
    }
    if (primaryCount > 1) {
      generalError = 'Only one person can be marked as primary contact';
      return { isValid: false, errors, generalError };
    }

    // Validate each person
    people.forEach((personWithContacts, personIndex) => {
      const person = personWithContacts.person;

      // First name validation
      if (!person.firstName || person.firstName.trim() === '') {
        errors[`person-${personIndex}-firstName`] = 'First name is required';
      } else if (person.firstName.trim().length < 2) {
        errors[`person-${personIndex}-firstName`] = 'First name must be at least 2 characters';
      }

      // Last name validation
      if (!person.lastName || person.lastName.trim() === '') {
        errors[`person-${personIndex}-lastName`] = 'Last name is required';
      } else if (person.lastName.trim().length < 2) {
        errors[`person-${personIndex}-lastName`] = 'Last name must be at least 2 characters';
      }

      // Contact validation
      personWithContacts.contacts.forEach((contact, contactIndex) => {
        const contactKey = `person-${personIndex}-contact-${contactIndex}`;

        if (!contact.contactValue || contact.contactValue.trim() === '') {
          errors[`${contactKey}-value`] = 'Contact value is required';
        } else {
          // Email validation
          if (contact.contactType === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(contact.contactValue)) {
              errors[`${contactKey}-value`] = 'Please enter a valid email address';
            }
          }

          // Phone validation
          if (['phone', 'mobile', 'work_phone'].includes(contact.contactType)) {
            const digits = contact.contactValue.replace(/\D/g, '');
            if (digits.length < 10) {
              errors[`${contactKey}-value`] = 'Phone number must have at least 10 digits';
            } else if (digits.length > 15) {
              errors[`${contactKey}-value`] = 'Phone number cannot exceed 15 digits';
            }
          }
        }
      });

      // Check if person has at least one contact
      if (personWithContacts.contacts.length === 0) {
        errors[`person-${personIndex}-contacts`] = 'Each person must have at least one contact method';
      }
    });

    // Address validation (optional but if provided, should be reasonable)
    if (address && address.trim().length > 0 && address.trim().length < 10) {
      errors['address'] = 'Address seems too short. Please provide a complete address';
    }

    return { isValid: Object.keys(errors).length === 0 && !generalError, errors, generalError };
  };

  // Helper function to clear field errors when user starts typing
  const clearFieldError = (fieldKey: string) => {
    if (fieldErrors[fieldKey]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
    // Also clear general error if user is making changes
    if (error) {
      setError(null);
    }
  };

  // Helper function to check if a field has an error
  const hasFieldError = (fieldKey: string) => !!fieldErrors[fieldKey];

  // Helper function to get field error message
  const getFieldError = (fieldKey: string) => fieldErrors[fieldKey];

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('📝 Form submission started');
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling to parent form

    // Clear previous errors
    setError(null);
    setFieldErrors({});

    // Enhanced validation
    const validation = validateForm();
    if (!validation.isValid) {
      console.log('📝 Validation failed:', validation);
      if (validation.generalError) {
        setError(validation.generalError);
      }
      setFieldErrors(validation.errors);
      return;
    }

    const dto: CreateHouseholdWithPeopleDto = {
      household: {
        householdName: householdName?.trim() || undefined,
        address: address?.trim() || undefined,
        notes: notes?.trim() || undefined,
      },
      people,
    };

    console.log('📝 Form data prepared:', dto);
    console.log('📝 Validation passed, submitting...');
    setIsSubmitting(true);

    try {
      console.log('📝 Calling onSubmit with dto...');
      await onSubmit(dto);
      console.log('📝 onSubmit completed successfully');
    } catch (err: any) {
      console.error('📝 onSubmit failed:', err);

      // Parse backend errors for more specific messages
      let errorMessage = 'Failed to create household';
      if (err.message) {
        const message = err.message.toLowerCase();

        if (message.includes('missing field') || message.includes('invalid args')) {
          errorMessage = 'Data format error. Please refresh the page and try again';
        } else if (message.includes('duplicate') || message.includes('already exists')) {
          errorMessage = 'A household with this information already exists';
        } else if (message.includes('database') || message.includes('sql')) {
          errorMessage = 'Database error occurred. Please try again';
        } else if (message.includes('validation') || message.includes('invalid')) {
          errorMessage = 'Invalid data provided. Please check all fields';
        } else if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
          errorMessage = 'Network error. Please check your connection and try again';
        } else if (message.includes('permission') || message.includes('unauthorized')) {
          errorMessage = 'Permission denied. Please check your access rights';
        } else if (message.includes('not found')) {
          errorMessage = 'Required resource not found. Please contact support';
        } else {
          // Show the actual error message if it's user-friendly, otherwise use generic
          errorMessage = err.message.length < 100 ? err.message : 'An unexpected error occurred. Please try again';
        }
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
      console.log('📝 Form submission ended');
    }
  };

  return (
    <div className="form-container">
      <div className="form">{/* Using div instead of form to prevent nesting issues */}
        {error && (
          <div className="form-error">
            <p>{error}</p>
          </div>
        )}

        <div className="form-body">
          {/* Household Info */}
          <div className="form-section">
            <h3>Household Information</h3>

            <div className="form-group">
              <label htmlFor="householdName">Household Name (Optional)</label>
              <input
                type="text"
                id="householdName"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g., The Smith Family"
              />
            </div>

            <div className="form-group">
              <label htmlFor="address">Address</label>
              <input
                type="text"
                id="address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  clearFieldError('address');
                }}
                placeholder="123 Main St, City, State ZIP"
                className={hasFieldError('address') ? 'error' : ''}
              />
              {hasFieldError('address') && (
                <span className="field-error">{getFieldError('address')}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional notes..."
              />
            </div>
          </div>

          {/* People */}
          <div className="form-section">
            <div className="section-header">
              <h3>People in Household</h3>
              {people.length < 5 && (
                <button
                  type="button"
                  onClick={addPerson}
                  className="btn btn-secondary btn-small"
                >
                  <Plus className="h-4 w-4" />
                  Add Person
                </button>
              )}
            </div>

            <div className="people-list">
              {people.map((personWithContacts, personIndex) => (
                <div key={personIndex} className="person-card">
                  <div className="person-header">
                    <div className="person-title">
                      <strong>Person {personIndex + 1}</strong>
                      {personWithContacts.person.isPrimary && (
                        <span className="primary-badge">Primary Contact</span>
                      )}
                    </div>
                    {people.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePerson(personIndex)}
                        className="btn-icon btn-danger"
                        title="Remove Person"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={personWithContacts.person.firstName}
                        onChange={(e) => {
                          updatePerson(personIndex, 'firstName', e.target.value);
                          clearFieldError(`person-${personIndex}-firstName`);
                        }}
                        required
                        placeholder="John"
                        className={hasFieldError(`person-${personIndex}-firstName`) ? 'error' : ''}
                      />
                      {hasFieldError(`person-${personIndex}-firstName`) && (
                        <span className="field-error">{getFieldError(`person-${personIndex}-firstName`)}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={personWithContacts.person.lastName}
                        onChange={(e) => {
                          updatePerson(personIndex, 'lastName', e.target.value);
                          clearFieldError(`person-${personIndex}-lastName`);
                        }}
                        required
                        placeholder="Smith"
                        className={hasFieldError(`person-${personIndex}-lastName`) ? 'error' : ''}
                      />
                      {hasFieldError(`person-${personIndex}-lastName`) && (
                        <span className="field-error">{getFieldError(`person-${personIndex}-lastName`)}</span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={personWithContacts.person.isPrimary || false}
                        onChange={(e) => updatePerson(personIndex, 'isPrimary', e.target.checked)}
                      />
                      Primary household contact
                    </label>
                  </div>

                  {/* Contacts */}
                  <div className="contacts-section">
                    <div className="contacts-header">
                      <h4>Contact Information</h4>
                      <button
                        type="button"
                        onClick={() => addContact(personIndex)}
                        className="btn btn-secondary btn-small"
                      >
                        <Plus className="h-3 w-3" />
                        Add Contact
                      </button>
                    </div>

                    {personWithContacts.contacts.length === 0 && (
                      <p className={`empty-state ${hasFieldError(`person-${personIndex}-contacts`) ? 'error' : ''}`}>
                        No contacts added yet
                        {hasFieldError(`person-${personIndex}-contacts`) && ' - Required'}
                      </p>
                    )}
                    {hasFieldError(`person-${personIndex}-contacts`) && (
                      <div className="contacts-error">
                        <span className="field-error">{getFieldError(`person-${personIndex}-contacts`)}</span>
                      </div>
                    )}

                    {personWithContacts.contacts.map((contact, contactIndex) => (
                      <div key={contactIndex} className="contact-row">
                        <select
                          value={contact.contactType}
                          onChange={(e) =>
                            updateContact(
                              personIndex,
                              contactIndex,
                              'contactType',
                              e.target.value as CreateContactDto['contactType']
                            )
                          }
                          className="contact-type"
                        >
                          <option value="phone">Phone</option>
                          <option value="mobile">Mobile</option>
                          <option value="work_phone">Work Phone</option>
                          <option value="email">Email</option>
                        </select>
                        <input
                          type={contact.contactType === 'email' ? 'email' : 'tel'}
                          value={contact.contactValue}
                          onChange={(e) => {
                            updateContact(personIndex, contactIndex, 'contactValue', e.target.value);
                            clearFieldError(`person-${personIndex}-contact-${contactIndex}-value`);
                          }}
                          placeholder={
                            contact.contactType === 'email' ? 'email@example.com' : '555-0123'
                          }
                          className={`contact-value ${hasFieldError(`person-${personIndex}-contact-${contactIndex}-value`) ? 'error' : ''}`}
                        />
                        {hasFieldError(`person-${personIndex}-contact-${contactIndex}-value`) && (
                          <div className="contact-error">
                            <span className="field-error">{getFieldError(`person-${personIndex}-contact-${contactIndex}-value`)}</span>
                          </div>
                        )}
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={contact.isPrimary || false}
                            onChange={(e) =>
                              updateContact(personIndex, contactIndex, 'isPrimary', e.target.checked)
                            }
                          />
                          Primary
                        </label>
                        <button
                          type="button"
                          onClick={() => removeContact(personIndex, contactIndex)}
                          className="btn-icon btn-danger"
                          title="Remove Contact"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Household'}
          </button>
        </div>
      </div>
    </div>
  );
};