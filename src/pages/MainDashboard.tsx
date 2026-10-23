/**
 * Example main dashboard using all Ant Design components
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Space, Tabs, App, InputNumber, Modal, Badge } from 'antd';
import { TeamOutlined, HeartOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Removed AppLayout - using simpler layout
import { PatientTable } from '../components/tables/PatientTable';
import { HouseholdTable } from '../components/tables/HouseholdTable';
import { Button } from '../components/common/Button';
import LabInboxList from '../components/LabInbox/LabInboxList';
import { useLabInboxCount } from '../hooks/useLabInbox';
import { invoke } from '@/services/invoke';
import { FormModal } from '../components/common/Modal';
import { PatientFormWithOwner } from '../components/forms/PatientFormWithOwner';
import { HouseholdForm } from '../components/forms/HouseholdForm';
import { PageLoader } from '../components/common/Loading';
import { NoPatientsFound, NoHouseholdsFound } from '../components/common/EmptyState';
import { LoadError } from '../components/common/LoadError';
import AppointmentsTab from './Appointments/AppointmentsTab';
import { useViewContext } from '../contexts/ViewContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePatientData, invalidateHouseholdData } from '../hooks/invalidation';
import api, { setAppInstance } from '../services/api.integration';
import { PatientService } from '../services';
import type { PatientWithHousehold } from '../types';
import type { CreatePatientInput } from '../types';
import type { HouseholdFormValues, HouseholdTableRecord } from '../types/ui.types';
import { normalizeMicrochip } from '@/hooks/useBarcodeScanner';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { BackupWarning } from '../components/BackupWarning';
import { TodayStrip } from '../components/TodayStrip';
import type { NewPatientFromScan } from '../layouts/ChipScanHandler';
import { messageOf } from '../utils/errors';
import styles from './MainDashboard.module.css';

// Removed TabPane - using items prop instead

const DASHBOARD_TABS = ['patients', 'households', 'appointments', 'labInbox'];

export const MainDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['patients', 'common', 'navigation']);
  const { currentView, setCurrentView } = useViewContext();
  const app = App.useApp();
  const activeView = currentView === 'animal' ? 'patients' : currentView === 'household' ? 'households' : 'appointments';
  // Tab and search live in the URL, so Back and reopening the dashboard keep them.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && DASHBOARD_TABS.includes(urlTab) ? urlTab : activeView;
  const searchText = searchParams.get('q') ?? '';
  const updateParams = useCallback(
    (changes: Record<string, string | null>) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const setActiveTab = (tab: string) => updateParams({ tab, q: null });

  // Lab results waiting in the inbox, shown as a badge on its tab
  const { data: labWaiting } = useLabInboxCount();
  // The full-page loader is for the first load only; later reloads update in place.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [patients, setPatients] = useState<PatientWithHousehold[]>([]);
  const [households, setHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientWithHousehold[]>([]);
  const [filteredHouseholds, setFilteredHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showHouseholdForm, setShowHouseholdForm] = useState(false);
  // Chip ID captured from a dashboard scan that didn't match any existing
  // patient — fed into PatientFormWithOwner via the defaultMicrochipId prop
  // so the vet doesn't have to retype it. Cleared when the form modal
  // closes (success OR cancel).
  const [scannedChipForNewPatient, setScannedChipForNewPatient] = useState<string | null>(null);
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
    setCurrentView('animal');
    setScannedChipForNewPatient(scannedChip);
    setShowPatientForm(true);
    navigate('?tab=patients', { replace: true, state: null });
  }, [scannedChip, navigate, setCurrentView]);

  const tRef = useRef(t);
  tRef.current = t;
  const loadData = useCallback(async () => {
    const t = tRef.current;
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
  }, []);

  // Load initial data from database and set app instance
  useEffect(() => {
    setAppInstance(app);
    loadData();
  }, [app, loadData]);

  const handleSeed = async () => {
    setSeeding(true);

    try {
      const households = Math.max(1, Number(seedCount) || 1000);

      const res = await invoke<string>('populate_database', { households });

      app.notification.success({ message: res || `Seeded ${households} households` });
      setSeedOpen(false);
      await loadData();
    } catch (e) {
      app.notification.error({ message: messageOf(e) || 'Failed to seed database' });
    } finally {
      setSeeding(false);
    }
  };

  // Refresh dashboard list when a patient is created anywhere
  useTauriEvent('patient-created', () => {
    loadData();
  });

  // The dashboard only adds; editing happens on the patient and household pages.
  const handleSavePatient = async (values: CreatePatientInput) => {
    const created = await api.patient.create(values);
    invalidatePatientData(queryClient);
    setShowPatientForm(false);
    // Clear any scan-prefill so subsequent "Add patient" clicks start blank.
    setScannedChipForNewPatient(null);
    if (created?.id) {
      navigate(`/patients/${created.id}`);
    } else {
      loadData();
    }
  };

  const handleSaveHousehold = async (values: HouseholdFormValues) => {
    await api.household.create(values);
    invalidateHouseholdData(queryClient);
    setShowHouseholdForm(false);
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
        <BackupWarning />
        <TodayStrip
          waitingLabCount={labWaiting ?? 0}
          onOpenLabResults={() => setActiveTab('labInbox')}
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
              // 'labInbox' is a local-only tab; no view context update needed
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
                {(activeTab === 'patients' || activeTab === 'households') && (
                  <Button
                    variant="primary"
                    iconType="plus"
                    onClick={() => {
                      if (activeTab === 'patients') {
                        setShowPatientForm(true);
                      } else {
                        setShowHouseholdForm(true);
                      }
                    }}
                    className={styles.viewToggle}
                    data-testid={activeTab === 'patients' ? 'add-patient-btn' : 'add-household-btn'}
                  >
                    {activeTab === 'patients' ? t('patients:addPatient') : t('patients:addHousehold')}
                  </Button>
                )}
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
                    searchText={searchText}
                    onSearchTextChange={(text) => {
                      // Normalize FDX-B hex reads to the 15-digit passport form.
                      // Catches the case where the scanner types into the search box
                      // directly (hook bails early when an input is focused).
                      const normalized = normalizeMicrochip(text);
                      updateParams({ q: normalized || null });
                      // When the user clears the search after a scan, restore the full list
                      // (scans narrow filteredPatients via the backend; clearing must undo that).
                      if (normalized === '') {
                        setFilteredPatients(patients);
                      }
                    }}
                  />
                ) : (
                  <NoPatientsFound onAction={() => setShowPatientForm(true)} />
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
                    searchText={searchText}
                    onSearchTextChange={(text) => updateParams({ q: text || null })}
                  />
                ) : (
                  <NoHouseholdsFound onAction={() => setShowHouseholdForm(true)} />
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
                key: 'labInbox',
                label: (
                  <span>
                    <FileTextOutlined />
                    {t('devices:inbox.title')}
                    {!!labWaiting && (
                      <Badge count={labWaiting} size="small" style={{ marginLeft: 8 }} />
                    )}
                  </span>
                ),
                children: <LabInboxList />,
              },
            ]}
          />
        </Card>
      </Space>

      {/* Patient Form Modal */}
      <FormModal
        title={t('patients:addPatient')}
        open={showPatientForm}
        onCancel={() => {
          setShowPatientForm(false);
          // Clear the pre-fill so the next "Add patient" click starts blank.
          setScannedChipForNewPatient(null);
        }}
        footer={null}
        width={800}
      >
        <PatientFormWithOwner
          defaultMicrochipId={scannedChipForNewPatient ?? undefined}
          onSubmit={handleSavePatient}
          onCancel={() => {
            setShowPatientForm(false);
            setScannedChipForNewPatient(null);
          }}
        />
      </FormModal>

      {/* Household Form Modal */}
      <FormModal
        title={t('patients:addHousehold')}
        open={showHouseholdForm}
        onCancel={() => {
          setShowHouseholdForm(false);
        }}
        footer={null}
        width={800}
      >
        <HouseholdForm
          onSubmit={handleSaveHousehold}
          onCancel={() => {
            setShowHouseholdForm(false);
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
