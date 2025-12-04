// ==UserScript==
// @name         Promedico ASP - Complete Automation Suite
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Auto-fill patient forms + MEDOVD EDI/ZIP import + Custom menu items
// @match        https://www.promedico-asp.nl/promedico/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================================
    // SHARED UTILITIES
    // ============================================================================

    // Get the content iframe
    function getContentIframe() {
        return document.getElementById('panelBackCompatibility-frame');
    }

    // Get the correct document (iframe or main)
    function getTargetDocument() {
        if (window.location.href.includes('admin.onderhoud.patienten')) {
            return document;
        }
        const iframe = getContentIframe();
        if (iframe) {
            try {
                return iframe.contentDocument || iframe.contentWindow.document;
            } catch (e) {
                console.error('Cannot access iframe:', e);
            }
        }
        return document;
    }

    // ============================================================================
    // CUSTOM MENU ITEMS
    // ============================================================================

    function clickSidebarButton(buttonId) {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                try {
                    const patientZoeken = document.getElementById('MainMenu-Patiënt-Zoeken');
                    if (patientZoeken) {
                        patientZoeken.click();
                        setTimeout(() => {
                            const iframe = document.getElementById('panelBackCompatibility-frame');
                            if (iframe && iframe.contentDocument) {
                                const button = iframe.contentDocument.getElementById('${buttonId}');
                                if (button) button.click();
                            }
                        }, 1000);
                    }
                } catch (e) {
                    console.error('Navigation error:', e);
                }
            })();
        `;
        document.head.appendChild(script);
        script.remove();
    }

    function addCustomMenuItem(afterElementId, newItemId, newItemText, sidebarButtonId) {
        const afterElement = document.getElementById(afterElementId);
        if (!afterElement) return false;
        if (document.getElementById(newItemId)) return true;

        const newMenuItem = afterElement.cloneNode(true);
        newMenuItem.id = newItemId;
        newMenuItem.textContent = newItemText;
        const cleanMenuItem = newMenuItem.cloneNode(true);

        cleanMenuItem.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            clickSidebarButton(sidebarButtonId);
        });

        afterElement.parentNode.insertBefore(cleanMenuItem, afterElement.nextSibling);
        return true;
    }

    function tryAddMenuItems() {
        const patientZoeken = document.getElementById('MainMenu-Patiënt-Zoeken');
        if (!patientZoeken) return false;
        if (document.getElementById('MainMenu-Patiënt-MedovdImport')) return true;

        const added1 = addCustomMenuItem(
            'MainMenu-Patiënt-Zoeken',
            'MainMenu-Patiënt-MedovdImport',
            'MEDOVD import',
            'action_medOvdImporteren'
        );

        const afterElement = added1 ? 'MainMenu-Patiënt-MedovdImport' : 'MainMenu-Patiënt-Zoeken';
        addCustomMenuItem(
            afterElement,
            'MainMenu-Patiënt-NieuwePatiënt',
            'Nieuwe patiënt',
            'action_Nieuwe patient inschrijven'
        );

        return added1;
    }

    function initCustomMenus() {
        // Only run on main index.html page
        if (!window.location.href.includes('index.html')) return;

        setTimeout(() => {
            tryAddMenuItems();
        }, 2000);

        const observer = new MutationObserver(() => {
            const patientZoeken = document.getElementById('MainMenu-Patiënt-Zoeken');
            const medovdImport = document.getElementById('MainMenu-Patiënt-MedovdImport');
            if (patientZoeken && !medovdImport) {
                tryAddMenuItems();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ============================================================================
    // AUTO MEDOVD IMPORT (EDI + ZIP)
    // ============================================================================

    function isOnMedovdImportPage() {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return false;
        const doc = iframe.contentDocument;
        return !!doc.getElementById('ediFile') && !!doc.getElementById('correspondentieFile');
    }

    function fillFormWithFiles(ediFile, zipFile) {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const ediInput = doc.getElementById('ediFile');
        const zipInput = doc.getElementById('correspondentieFile');
        const submitButton = doc.getElementById('Script_Bestand inlezen');

        if (!ediInput || !zipInput || !submitButton) return;

        const ediDataTransfer = new DataTransfer();
        ediDataTransfer.items.add(ediFile);
        ediInput.files = ediDataTransfer.files;

        const zipDataTransfer = new DataTransfer();
        zipDataTransfer.items.add(zipFile);
        zipInput.files = zipDataTransfer.files;

        ediInput.dispatchEvent(new Event('change', { bubbles: true }));
        zipInput.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
            submitButton.click();
        }, 500);
    }

    function processDroppedFiles(files) {
        if (files.length !== 2) return;
        if (!isOnMedovdImportPage()) return;

        let ediFile = null;
        let zipFile = null;

        for (let file of files) {
            const fileName = file.name.toLowerCase();
            if (fileName.endsWith('.edi')) {
                ediFile = file;
            } else if (fileName.endsWith('.zip')) {
                zipFile = file;
            }
        }

        if (!ediFile || !zipFile) return;
        fillFormWithFiles(ediFile, zipFile);
    }

    function setupIframeListeners() {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        if (doc.hasDropListener) return;

        doc.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, true);

        doc.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            processDroppedFiles(Array.from(e.dataTransfer.files));
        }, true);

        doc.hasDropListener = true;
    }

    function initMedovdImport() {
        setInterval(setupIframeListeners, 2000);
    }

    // ============================================================================
    // PATIENT FORM AUTO-FILL
    // ============================================================================

function parseData(text) {
    const data = {};
    let lines = text.split(/\r?\n/);

    if (lines.length === 1 && text.length > 100) {
        const fieldPattern = /(Van|Berichtinhoud|Voorletters|Voornamen|Tussenvoegsel|Achternaam|Meisjesnaam|Naam volgorde|BSN|Type ID bewijs|ID bewijs nummer|Geboorteplaats|Geboortedatum|Geslacht|Gender|Beroep|Adresgegevens|Telefoonnummer|Zorgverzekeraar|Polisnummer|Polisdatum|Apotheek|LSP toestemming|Vorige huisarts|Adres huisarts|Telefoonnummer huisarts|Toestemming opvragen dossier|Opmerkingen patient):/g;
        let matches = [];
        let match;
        while ((match = fieldPattern.exec(text)) !== null) {
            matches.push({ name: match[1], index: match.index });
        }
        lines = [];
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const line = text.substring(start, end).trim();
            lines.push(line);
        }
    }

    for (let line of lines) {
        if (line.includes(':')) {
            const colonIndex = line.indexOf(':');
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            if (key && value) {
                data[key] = value;
            }
        }
    }

    if (data['Van'] && !data['E-mail']) {
        const emailMatch = data['Van'].match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
            data['E-mail'] = emailMatch[0];
        }
    }

    return data;
}

    function fillField(fieldId, value) {
        const targetDoc = getTargetDocument();
        const field = targetDoc.getElementById(fieldId);

        if (!field) return false;

        if (field.tagName === 'SELECT') {
            let found = false;
            for (let option of field.options) {
                if (option.text.toLowerCase().includes(value.toLowerCase()) ||
                    option.value.toLowerCase() === value.toLowerCase()) {
                    field.value = option.value;
                    found = true;
                    break;
                }
            }
            if (!found) return false;
        } else if (field.type === 'radio') {
            field.checked = true;
        } else {
            field.value = value;
        }

        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));

        if (field.onchange) {
            try {
                field.onchange();
            } catch(e) {}
        }

        return true;
    }

function fillForm(data) {
    let filled = 0;

    // Meisjesnaam (maiden name) goes to Achternaam
    if (data['Meisjesnaam']) {
        if (fillField('patientPersoonWrapper.persoon.achternaam', data['Meisjesnaam'])) filled++;
    }

    // Achternaam (from data) goes to Partner achternaam
    if (data['Achternaam']) {
        if (fillField('patientPersoonWrapper.persoon.partnerachternaam', data['Achternaam'])) filled++;
    }

    // Tussenvoegsel (prefix like "van", "de", etc.)
    if (data['Tussenvoegsel']) {
        if (fillField('patientPersoonWrapper.persoon.tussenvoegsel', data['Tussenvoegsel'])) filled++;
    }

if (data['Naam volgorde']) {
    // Map the input format to the field format
    let naamgebruik = data['Naam volgorde'].toLowerCase().trim();

    // Remove dashes and extra spaces
    naamgebruik = naamgebruik.replace(/\s*[-–]\s*/g, ' ').trim();

    // Only replace space with underscore if there are multiple words
    if (naamgebruik.includes(' ')) {
        naamgebruik = naamgebruik.replace(/\s+/g, '_');
    }

    if (fillField('patientPersoonWrapper.persoon.naamgebruik', naamgebruik)) filled++;
}

    if (data['Voorletters']) {
        const voorletters = data['Voorletters'].replace(/\./g, '');
        if (fillField('patientPersoonWrapper.persoon.voorletters', voorletters)) filled++;
    }

    if (data['Voornamen']) {
        if (fillField('patientPersoonWrapper.persoon.roepnaam', data['Voornamen'])) filled++;
    }

    if (data['Geboortedatum']) {
        let geboortedatum = data['Geboortedatum'];
        const monthMap = {
            'jan': '01', 'feb': '02', 'mrt': '03', 'apr': '04',
            'mei': '05', 'jun': '06', 'jul': '07', 'aug': '08',
            'sep': '09', 'okt': '10', 'nov': '11', 'dec': '12'
        };
        const match = geboortedatum.match(/(\d+)\s+(\w+)\s+(\d{4})/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = monthMap[match[2].toLowerCase()] || match[2];
            const year = match[3];
            geboortedatum = `${day}-${month}-${year}`;
        }
        if (fillField('patientPersoonWrapper.persoon.geboortedatum', geboortedatum)) filled++;
    }

    if (data['Geboorteplaats']) {
        if (fillField('patientPersoonWrapper.persoon.geboorteplaats', data['Geboorteplaats'])) filled++;
    }

    if (data['Geslacht']) {
        const geslacht = data['Geslacht'].toLowerCase().includes('man') ? 'M' : 'V';
        if (fillField('patientPersoonWrapper.persoon.geslachtString', geslacht)) filled++;
    }

    if (data['Beroep']) {
        if (fillField('patientPersoonWrapper.persoon.beroep', data['Beroep'])) filled++;
    }

    if (data['Telefoonnummer']) {
        if (fillField('patientPersoonWrapper.persoon.telefoonnummer1', data['Telefoonnummer'])) filled++;
    }

    if (data['E-mail']) {
        if (fillField('patientPersoonWrapper.persoon.email', data['E-mail'])) filled++;
    }

    const targetDoc = getTargetDocument();
    const huisartsField = targetDoc.getElementById('praktijkMedewerker');
    if (huisartsField) {
        for (let option of huisartsField.options) {
            if (option.text.includes('E.A.') && option.text.includes('Westerbeek van Eerten')) {
                huisartsField.value = option.value;
                huisartsField.dispatchEvent(new Event('change', { bubbles: true }));
                if (huisartsField.onchange) huisartsField.onchange();
                filled++;
                break;
            }
        }
    }

    if (data['BSN']) {
        if (fillField('bsn', data['BSN'])) filled++;
    }

    if (data['ID bewijs nummer']) {
        if (fillField('patientPersoonWrapper.persoon.identificatieDocNumber', data['ID bewijs nummer'])) filled++;
    }

    if (data['Type ID bewijs']) {
        const typeMap = {
            'Paspoort': 'P',
            'Rijbewijs': 'R',
            'Identiteitskaart': 'I'
        };
        const typeValue = typeMap[data['Type ID bewijs']] || data['Type ID bewijs'];
        if (fillField('patientPersoonWrapper.persoon.widDocSoort', typeValue)) filled++;
    }

    const identiteitJa = targetDoc.getElementById('identiteitVergewistJa');
    if (identiteitJa) {
        identiteitJa.checked = true;
        identiteitJa.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
    }

    return filled;
}

    function isPatientFormPage() {
        return window.location.href.includes('admin.onderhoud.patienten');
    }

    function createUI() {
        if (!isPatientFormPage()) return;

        const targetDoc = getTargetDocument();

        // Check if button already exists
        if (targetDoc.getElementById('promedico-autofill-btn')) return;

        // Find the "Terug" button
        const terugButton = targetDoc.getElementById('Button_<< Terug');
        if (!terugButton) return;

        // Create new button styled like existing buttons
        const button = targetDoc.createElement('input');
        button.id = 'promedico-autofill-btn';
        button.type = 'BUTTON';
        button.value = 'Informatie vullen';
        button.tabIndex = 101;
        button.style.cssText = 'cursor: pointer; margin-right: 5px;';

        button.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            const text = prompt('Plak de patiëntgegevens hier:');
            if (text) {
                const data = parseData(text);
                const filled = fillForm(data);
                alert(`✓ ${filled} velden ingevuld!`);
            }
            return false;
        };

        // Insert before "Terug" button
        terugButton.parentNode.insertBefore(button, terugButton);
    }

    function initPatientForm() {
        // Initial attempt
        if (document.body) {
            createUI();
        } else {
            setTimeout(initPatientForm, 500);
        }

        // Monitor for page changes (iframe navigation)
        setInterval(() => {
            createUI();
        }, 2000);
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    function init() {
        // Custom menu items (only on main page)
        initCustomMenus();

        // MEDOVD import drag & drop
        initMedovdImport();

        // Patient form auto-fill button
        initPatientForm();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
