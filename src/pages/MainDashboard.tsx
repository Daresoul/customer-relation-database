/**
 * Example main dashboard using all Ant Design components
 */

import React, { useState, useEffect } from 'react';
import { Card, Space, Tabs, App, InputNumber, Modal, Badge } from 'antd';
import { TeamOutlined, HeartOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Removed AppLayout - using simpler layout
import { PatientTable } from '../components/tables/PatientTable';
import { HouseholdTable } from '../components/tables/HouseholdTable';
import { PatientSearch } from '../components/search/PatientSearch';
import { HouseholdSearch } from '../components/search/HouseholdSearch';
import { Button } from '../components/common/Button';
import PendingDeviceTable from '../components/PendingDeviceTable';
import { fileHistoryService } from '../services/fileHistoryService';
import { invoke } from '@/services/invoke';
import { FormModal } from '../components/common/Modal';
import { PatientFormWithOwner } from '../components/forms/PatientFormWithOwner';
import { HouseholdForm } from '../components/forms/HouseholdForm';
import { Loading, PageLoader } from '../components/common/Loading';
import { NoData } from '../components/common/EmptyState';
import { LoadError } from '../components/common/LoadError';
import AppointmentsTab from './Appointments/AppointmentsTab';
import { useViewContext } from '../contexts/ViewContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePatientData, invalidateHouseholdData } from '../hooks/invalidation';
import api, { setAppInstance } from '../services/api.integration';
import { PatientService } from '../services';
import type { Patient, PatientWithHousehold } from '../types';
import type { HouseholdTableRecord } from '../types/ui.types';
import { useThemeColors } from '../utils/themeStyles';
import { normalizeMicrochip } from '@/hooks/useBarcodeScanner';
import { listen } from '@tauri-apps/api/event';
import { TodayStrip } from '../components/TodayStrip';
import type { NewPatientFromScan } from '../layouts/ChipScanHandler';
import styles from './MainDashboard.module.css';

// Removed TabPane - using items prop instead

export const MainDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['patients', 'common', 'navigation']);
  const { currentView, setCurrentView } = useViewContext();
  const app = App.useApp();
  const themeColors = useThemeColors();
  const activeView = currentView === 'animal' ? 'patients' : currentView === 'household' ? 'households' : 'appointments';
  // Local tab state so we can include custom tabs (like 'saved')
  const [activeTab, setActiveTab] = useState<string>(activeView);
  useEffect(() => setActiveTab(activeView), [activeView]);

  // Count of device results parked in "Saved for Later", shown as a badge on the
  // tab so staff can see there's a queue without opening it. The table only mounts
  // when its tab is active, so the dashboard tracks the count independently.
  const [pendingCount, setPendingCount] = useState(0);
  const loadPendingCount = React.useCallback(async () => {
    try {
      const res = await fileHistoryService.listPendingDeviceEntries();
      setPendingCount(res.length);
    } catch {
      // non-critical
    }
  }, []);
  useEffect(() => {
    loadPendingCount();
    const interval = setInterval(loadPendingCount, 60000);
    return () => clearInterval(interval);
  }, [loadPendingCount]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [patients, setPatients] = useState<PatientWithHousehold[]>([]);
  const [households, setHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientWithHousehold[]>([]);
  const [patientSearchText, setPatientSearchText] = useState('');
  const [filteredHouseholds, setFilteredHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showHouseholdForm, setShowHouseholdForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientWithHousehold | null>(null);
  // Chip ID captured from a dashboard scan that didn't match any existing
  // patient — fed into PatientFormWithOwner via the defaultMicrochipId prop
  // so the vet doesn't have to retype it. Cleared when the form modal
  // closes (success OR cancel).
  const [scannedChipForNewPatient, setScannedChipForNewPatient] = useState<string | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdTableRecord | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedCount, setSeedCount] = useState<number>(1000);
  const [seeding, setSeeding] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // A chip scan that matched nobody lands here (see ChipScanHandler) to
  // create the patient with the chip filled in. Clear the state so Back or a
  // reload does not reopen the form.
  const scannedChip = (location.state as NewPatientFromScan | null)?.newPatientChip;
  useEffect(() => {
    if (!scannedChip) return;
    setActiveTab('patients');
    setCurrentView('animal');
    setSelectedPatient(null);
    setScannedChipForNewPatient(scannedChip);
    setShowPatientForm(true);
    navigate('.', { replace: true, state: null });
  }, [scannedChip, navigate, setCurrentView]);

  // Load initial data from database and set app instance
  useEffect(() => {
    setAppInstance(app);
    loadData();
  }, [app]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Every patient and household; the tables page on the client
      const [patientsResults, householdsResults] = await Promise.all([
        PatientService.getPatients(), // Fetch all patients without search limit
        api.household.search(''),
      ]);

      // Enhance patients with household names
      const enhancedPatients = patientsResults.map(patient => {
        const household = householdsResults.find(h => h.id === patient.householdId);
        return {
          ...patient,
          household: household ? {
            id: household.id,
            householdName: household.lastName || t('households:unnamed'),
            address: household.address
          } : undefined
        } as PatientWithHousehold;
      });

      setPatients(enhancedPatients);
      setHouseholds(householdsResults);
      setFilteredPatients(enhancedPatients);
      setFilteredHouseholds(householdsResults);

      setLoadError(null);
    } catch (error) {
      console.error('Failed to load data:', error);
      // Keep whatever was shown before; a failure must never look like an empty clinic.
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);

    try {
      const households = Math.max(1, Number(seedCount) || 1000);

      const res = await invoke<string>('populate_database', { households });

      app.notification.success({ message: res || `Seeded ${households} households` });
      setSeedOpen(false);
      await loadData();
    } catch (e: any) {
      app.notification.error({ message: e?.message || 'Failed to seed database' });
    } finally {
      setSeeding(false);
    }
  };

  // Refresh dashboard list when a patient is created anywhere
  useEffect(() => {
    let unlistenCreated: (() => void) | undefined;
    const setup = async () => {
      unlistenCreated = await listen('patient-created', async () => {
        await loadData();
      });
    };
    setup();
    return () => { if (unlistenCreated) unlistenCreated(); };
  }, []);

  const handleHouseholdSearch = async (query: string) => {
    if (!query || query.trim().length === 0) {
      setFilteredHouseholds(households);
      return households;
    }

    const results = await api.household.search(query);
    setFilteredHouseholds(results);
    return results;
  };

  // Handle patient operations
  const handleViewPatient = (patient: PatientWithHousehold) => {
    setSelectedPatient(patient);
    // Open detail view modal
  };

  const handleEditPatient = (patient: PatientWithHousehold) => {
    setSelectedPatient(patient);
    setShowPatientForm(true);
  };

  const handleDeletePatient = async (patient: PatientWithHousehold) => {
    if (!window.confirm(t('patients:confirmDelete', { name: patient.name }))) {
      return;
    }
    await api.patient.delete(patient.id);
    invalidatePatientData(queryClient);
    loadData();
  };

  const handleSavePatient = async (values: any) => {
    if (selectedPatient) {
      await api.patient.update(selectedPatient.id, values);
    } else {
      await api.patient.create(values);
    }
    invalidatePatientData(queryClient);
    setShowPatientForm(false);
    setSelectedPatient(null);
    // Clear any scan-prefill so subsequent "Add patient" clicks start blank.
    setScannedChipForNewPatient(null);
    loadData();
  };

  // Handle household operations
  const handleViewHousehold = (household: HouseholdTableRecord) => {
    setSelectedHousehold(household);
    // Open detail view modal
  };

  const handleEditHousehold = (household: HouseholdTableRecord) => {
    setSelectedHousehold(household);
    setShowHouseholdForm(true);
  };

  const handleDeleteHousehold = async (household: HouseholdTableRecord) => {
    if (!window.confirm(t('patients:confirmDeleteHousehold', { name: household.lastName }))) {
      return;
    }
    await api.household.delete(household.id);
    invalidateHouseholdData(queryClient);
    loadData();
  };

  const handleSaveHousehold = async (values: any) => {
    if (selectedHousehold) {
      await api.household.update(selectedHousehold.id, values);
    } else {
      await api.household.create(values);
    }
    invalidateHouseholdData(queryClient);
    setShowHouseholdForm(false);
    setSelectedHousehold(null);
    loadData();
  };

  if (loading) {
    return <PageLoader message={t('common:loading')} />;
  }

  const loadErrorAlert = loadError ? (
    <LoadError title={t('patients:dashboard.loadFailed')} onRetry={loadData} />
  ) : null;
  const hasLoaded = !loadError || patients.length > 0 || households.length > 0;

  return (
    <div className={styles.dashboard}>
      <Space direction="vertical" size="large" className={styles.contentWrapper}>
        {loadErrorAlert}
        <TodayStrip
          waitingLabCount={pendingCount}
          onOpenLabResults={() => {
            setActiveTab('saved');
            loadPendingCount();
          }}
        />

        {/* Data Tables with integrated search */}
        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === 'patients') setCurrentView('animal');
              else if (key === 'households') setCurrentView('household');
              else if (key === 'appointments') setCurrentView('appointments');
              // 'saved' is a local-only tab; no view context update needed
              // Keep the badge fresh as staff move between tabs.
              loadPendingCount();
            }}
            tabBarExtraContent={
              <Space>
                {import.meta.env.DEV && (
                  <Button
                    variant="secondary"
                    onClick={() => setSeedOpen(true)}
                  >
                    Seed DB
                  </Button>
                )}
                <Button
                  variant="primary"
                  iconType="plus"
                  onClick={() => {
                    if (activeView === 'patients') {
                      setShowPatientForm(true);
                    } else if (activeView === 'households') {
                      setShowHouseholdForm(true);
                    }
                  }}
                  className={activeView === 'appointments' ? styles.viewToggleHidden : styles.viewToggle}
                  data-testid={activeView === 'patients' ? 'add-patient-btn' : 'add-household-btn'}
                >
                  {activeView === 'patients' ? t('patients:addPatient') : t('patients:addHousehold')}
                </Button>
              </Space>
            }
            items={[
              {
                key: 'patients',
                label: (
                  <span>
                    <HeartOutlined />
                    {t('navigation:patients')}
                  </span>
                ),
                children: !hasLoaded ? null : filteredPatients.length > 0 || patients.length > 0 ? (
                  <PatientTable
                    patients={filteredPatients}
                    onView={handleViewPatient}
                    onEdit={handleEditPatient}
                    onDelete={handleDeletePatient}
                    searchText={patientSearchText}
                    onSearchTextChange={(text) => {
                      // Normalize FDX-B hex reads to the 15-digit passport form.
                      // Catches the case where the scanner types into the search box
                      // directly (hook bails early when an input is focused).
                      const normalized = normalizeMicrochip(text);
                      setPatientSearchText(normalized);
                      // When the user clears the search after a scan, restore the full list
                      // (scans narrow filteredPatients via the backend; clearing must undo that).
                      if (normalized === '') {
                        setFilteredPatients(patients);
                      }
                    }}
                  />
                ) : (
                  <NoData />
                ),
              },
              {
                key: 'households',
                label: (
                  <span>
                    <TeamOutlined />
                    {t('navigation:households')}
                  </span>
                ),
                children: !hasLoaded ? null : filteredHouseholds.length > 0 || households.length > 0 ? (
                  <HouseholdTable
                    households={filteredHouseholds}
                    onView={handleViewHousehold}
                    onEdit={handleEditHousehold}
                    onDelete={handleDeleteHousehold}
                  />
                ) : (
                  <NoData />
                ),
              },
              {
                key: 'appointments',
                label: (
                  <span>
                    <CalendarOutlined />
                    {t('navigation:appointments')}
                  </span>
                ),
                children: <AppointmentsTab />,
              },
              {
                key: 'saved',
                label: (
                  <span>
                    <FileTextOutlined />
                    {t('devices:pending.title')}
                    {pendingCount > 0 && (
                      <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />
                    )}
                  </span>
                ),
                children: <PendingDeviceTable onItemsLoaded={setPendingCount} />,
              },
            ]}
          />
        </Card>
      </Space>

      {/* Patient Form Modal */}
      <FormModal
        title={selectedPatient ? t('patients:editPatient') : t('patients:addPatient')}
        open={showPatientForm}
        onCancel={() => {
          setShowPatientForm(false);
          setSelectedPatient(null);
          // Clear the pre-fill so the next "Add patient" click starts blank.
          setScannedChipForNewPatient(null);
        }}
        footer={null}
        width={800}
      >
        <PatientFormWithOwner
          patient={selectedPatient || undefined}
          defaultMicrochipId={selectedPatient ? undefined : (scannedChipForNewPatient ?? undefined)}
          onSubmit={handleSavePatient}
          onCancel={() => {
            setShowPatientForm(false);
            setSelectedPatient(null);
            setScannedChipForNewPatient(null);
          }}
        />
      </FormModal>

      {/* Household Form Modal */}
      <FormModal
        title={selectedHousehold ? t('patients:editHousehold') : t('patients:addHousehold')}
        open={showHouseholdForm}
        onCancel={() => {
          setShowHouseholdForm(false);
          setSelectedHousehold(null);
        }}
        footer={null}
        width={800}
      >
        <HouseholdForm
          initialValues={selectedHousehold || undefined}
          onSubmit={handleSaveHousehold}
          onCancel={() => {
            setShowHouseholdForm(false);
            setSelectedHousehold(null);
          }}
        />
      </FormModal>

      {/* Seed Database Modal (dev only) */}
      <Modal
        title="Seed Database"
        open={seedOpen}
        onOk={handleSeed}
        confirmLoading={seeding}
        onCancel={() => !seeding && setSeedOpen(false)}
        okText={seeding ? 'Seeding...' : 'Seed'}
      >
        <p>Populate the database with demo data:</p>
        <ul>
          <li>Households: N (each with 1–5 pets)</li>
          <li>Each pet: 1–5 procedures and 1–5 notes</li>
        </ul>
        <div className={styles.searchControls}>
          <span>Households:</span>
          <InputNumber
            min={1}
            max={100000}
            value={seedCount}
            onChange={(v) => {
              // v can be null or number from Ant Design InputNumber
              const value = v === null || v === undefined ? 1000 : Number(v);
              setSeedCount(value);
            }}
          />
        </div>
      </Modal>
    </div>
  );
};
