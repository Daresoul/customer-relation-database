-- Migration: Create FTS5 virtual table for household search
-- Purpose: Enable fast full-text search across households, people, and contacts

-- Create the FTS5 virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS household_search USING fts5(
    household_id UNINDEXED,
    household_name,
    address,
    people_names,
    contact_values,
    display_name,
    tokenize = 'porter',
    prefix = '2,3,4'
);

-- Trigger to maintain search index when household is inserted
CREATE TRIGGER IF NOT EXISTS household_search_insert
AFTER INSERT ON households
BEGIN
    INSERT INTO household_search (
        household_id,
        household_name,
        address,
        people_names,
        contact_values,
        display_name
    )
    VALUES (
        NEW.id,
        IFNULL(NEW.household_name, ''),
        IFNULL(NEW.address, ''),
        '',  -- Will be updated when people are added
        '',  -- Will be updated when contacts are added
        IFNULL(NEW.household_name, 'Household ' || NEW.id)
    );
END;

-- Trigger to update search index when household is updated
CREATE TRIGGER IF NOT EXISTS household_search_update_household
AFTER UPDATE ON households
BEGIN
    UPDATE household_search
    SET household_name = IFNULL(NEW.household_name, ''),
        address = IFNULL(NEW.address, ''),
        display_name = CASE
            WHEN NEW.household_name IS NOT NULL THEN NEW.household_name
            WHEN EXISTS (SELECT 1 FROM people WHERE household_id = NEW.id)
            THEN (
                SELECT CASE
                    WHEN COUNT(*) = 1 THEN MIN(first_name || ' ' || last_name)
                    WHEN COUNT(*) = 2 THEN
                        GROUP_CONCAT(last_name, ' & ')
                    ELSE NEW.household_name
                END
                FROM people WHERE household_id = NEW.id
            )
            ELSE 'Household ' || NEW.id
        END
    WHERE household_id = NEW.id;
END;

-- Trigger to update search index when people are added
CREATE TRIGGER IF NOT EXISTS people_update_search_insert
AFTER INSERT ON people
BEGIN
    UPDATE household_search
    SET people_names = (
        SELECT GROUP_CONCAT(first_name || ' ' || last_name, ' ')
        FROM people WHERE household_id = NEW.household_id
    ),
    display_name = CASE
        WHEN (SELECT household_name FROM households WHERE id = NEW.household_id) IS NOT NULL
        THEN (SELECT household_name FROM households WHERE id = NEW.household_id)
        ELSE (
            SELECT CASE
                WHEN COUNT(*) = 1 THEN MIN(first_name || ' ' || last_name)
                WHEN COUNT(*) = 2 THEN GROUP_CONCAT(last_name, ' & ')
                ELSE (SELECT household_name FROM households WHERE id = NEW.household_id)
            END
            FROM people WHERE household_id = NEW.household_id
        )
    END
    WHERE household_id = NEW.household_id;
END;

-- Trigger to update search index when people are updated
CREATE TRIGGER IF NOT EXISTS people_update_search_update
AFTER UPDATE ON people
BEGIN
    UPDATE household_search
    SET people_names = (
        SELECT GROUP_CONCAT(first_name || ' ' || last_name, ' ')
        FROM people WHERE household_id = NEW.household_id
    ),
    display_name = CASE
        WHEN (SELECT household_name FROM households WHERE id = NEW.household_id) IS NOT NULL
        THEN (SELECT household_name FROM households WHERE id = NEW.household_id)
        ELSE (
            SELECT CASE
                WHEN COUNT(*) = 1 THEN MIN(first_name || ' ' || last_name)
                WHEN COUNT(*) = 2 THEN GROUP_CONCAT(last_name, ' & ')
                ELSE (SELECT household_name FROM households WHERE id = NEW.household_id)
            END
            FROM people WHERE household_id = NEW.household_id
        )
    END
    WHERE household_id = NEW.household_id;
END;

-- Trigger to update search index when contacts are added
CREATE TRIGGER IF NOT EXISTS contacts_update_search_insert
AFTER INSERT ON person_contacts
BEGIN
    UPDATE household_search
    SET contact_values = (
        SELECT GROUP_CONCAT(pc.contact_value, ' ')
        FROM person_contacts pc
        JOIN people p ON pc.person_id = p.id
        WHERE p.household_id = (SELECT household_id FROM people WHERE id = NEW.person_id)
    )
    WHERE household_id = (SELECT household_id FROM people WHERE id = NEW.person_id);
END;

-- Trigger to update search index when contacts are updated
CREATE TRIGGER IF NOT EXISTS contacts_update_search_update
AFTER UPDATE ON person_contacts
BEGIN
    UPDATE household_search
    SET contact_values = (
        SELECT GROUP_CONCAT(pc.contact_value, ' ')
        FROM person_contacts pc
        JOIN people p ON pc.person_id = p.id
        WHERE p.household_id = (SELECT household_id FROM people WHERE id = NEW.person_id)
    )
    WHERE household_id = (SELECT household_id FROM people WHERE id = NEW.person_id);
END;

-- Trigger to clean up search index on household deletion
CREATE TRIGGER IF NOT EXISTS household_search_delete
AFTER DELETE ON households
BEGIN
    DELETE FROM household_search WHERE household_id = OLD.id;
END;