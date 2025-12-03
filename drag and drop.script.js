// ==UserScript==
// @name         Promedico ASP - Enhanced Drag and Drop File Upload
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Smart drag and drop file upload for Promedico ASP with auto-navigation and form filling
// @author       sthroos
// @match        https://www.promedico-asp.nl/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let uploadedFileName = '';

    // Wait for page to load
    window.addEventListener('load', function() {
        setTimeout(initDragAndDrop, 1000);
        // Monitor for page changes (for auto-fill after navigation)
        observePageChanges();
    });

    function initDragAndDrop() {
        // Create drag and drop overlay
        const dropOverlay = document.createElement('div');
        dropOverlay.id = 'dragDropOverlay';
        dropOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(2, 117, 216, 0.9);
            display: none;
            z-index: 99999;
            pointer-events: none;
        `;

        const dropText = document.createElement('div');
        dropText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            font-family: Arial, sans-serif;
        `;
        dropText.innerHTML = `
            <div style="font-size: 64px; margin-bottom: 20px;">📁</div>
            Drop bestand hier om te uploaden
        `;

        dropOverlay.appendChild(dropText);
        document.body.appendChild(dropOverlay);

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Show overlay on drag enter
        let dragCounter = 0;
        document.body.addEventListener('dragenter', function(e) {
            dragCounter++;
            if (dragCounter === 1) {
                dropOverlay.style.display = 'block';
            }
        });

        // Hide overlay on drag leave
        document.body.addEventListener('dragleave', function(e) {
            dragCounter--;
            if (dragCounter === 0) {
                dropOverlay.style.display = 'none';
            }
        });

        // Handle drop
        document.body.addEventListener('drop', function(e) {
            dragCounter = 0;
            dropOverlay.style.display = 'none';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0]);
            }
        });
    }

    // SAFEGUARD #1: Check if we're on the document upload section
    function isOnDocumentUploadPage() {
        // Check in main document
        const mainText = document.body.textContent || '';

        // Check in iframe
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        let iframeText = '';

        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeText = iframeDoc.body.textContent || '';
            } catch (error) {
                console.log('Cannot access iframe content');
            }
        }

        const combinedText = mainText + ' ' + iframeText;

        // Look for key phrases that indicate we're on the document upload workflow
        const hasUploadIndicators =
            combinedText.includes('Document uploaden') ||
            combinedText.includes('Document scannen') ||
            combinedText.includes('Brief samenstellen') ||
            combinedText.includes('Omschrijving') && combinedText.includes('Bestand');

        return hasUploadIndicators;
    }

    // Check if we're on the initial choice screen (Brief samenstellen, Document scannen, Document uploaden)
    function isOnInitialChoiceScreen() {
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return false;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const text = iframeDoc.body.textContent || '';

            // Check if all three options are present AND no file input exists yet
            const hasAllOptions = text.includes('Brief samenstellen') &&
                                 text.includes('Document scannen') &&
                                 text.includes('Document uploaden');
            const hasFileInput = iframeDoc.querySelector('input[type="file"]') !== null;

            return hasAllOptions && !hasFileInput;
        } catch (error) {
            return false;
        }
    }

    // Check if we're on the file upload screen (step 1)
    function isOnFileUploadScreen() {
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return false;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const fileInput = iframeDoc.querySelector('input[type="file"]');
            return fileInput !== null;
        } catch (error) {
            return false;
        }
    }

    // Check if we're on the description screen (step 3)
    function isOnDescriptionScreen() {
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return false;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const text = iframeDoc.body.textContent || '';

            // Look for "Omschrijving" field - typical of the final form
            const hasOmschrijving = iframeDoc.querySelector('input[name*="omschrijving" i], input[id*="omschrijving" i], textarea[name*="omschrijving" i]');
            return hasOmschrijving !== null;
        } catch (error) {
            return false;
        }
    }

    function handleFileUpload(file) {
        console.log('File dropped:', file.name);
        uploadedFileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

        // SAFEGUARD: Check if we're on the correct page
        if (!isOnDocumentUploadPage()) {
            showNotification('⚠️ Niet op document upload pagina. Upload geannuleerd.', 'error');
            return;
        }

        // FEATURE #2: If on initial choice screen, click "Document uploaden" first
        if (isOnInitialChoiceScreen()) {
            console.log('On initial choice screen, clicking Document uploaden...');
            clickDocumentUploaden(file);
            return;
        }

        // FEATURE #3: If already on upload screen, proceed with upload
        if (isOnFileUploadScreen()) {
            performFileUpload(file);
            return;
        }

        showNotification('Kan uploadstatus niet bepalen', 'error');
    }

    function clickDocumentUploaden(file) {
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) {
            showNotification('Iframe niet gevonden', 'error');
            return;
        }

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            // Find the "Document uploaden" button/link - try multiple approaches
            let uploadButton = null;

            // Try 1: Find by text content in buttons
            const buttons = Array.from(iframeDoc.querySelectorAll('button, a, input[type="button"], input[type="submit"], span[onclick], div[onclick]'));
            uploadButton = buttons.find(el => {
                const text = (el.textContent || el.value || el.innerText || '').toLowerCase();
                return text.includes('document uploaden');
            });

            // Try 2: Find by looking for clickable elements with specific text
            if (!uploadButton) {
                const allElements = Array.from(iframeDoc.querySelectorAll('*'));
                uploadButton = allElements.find(el => {
                    const text = (el.textContent || '').trim().toLowerCase();
                    const hasClickHandler = el.onclick || el.getAttribute('onclick');
                    return text === 'document uploaden' && hasClickHandler;
                });
            }

            if (uploadButton) {
                console.log('Clicking Document uploaden button:', uploadButton);
                uploadButton.click();
                showNotification('→ Navigeren naar Document uploaden...', 'info');

                // Wait for page to load, then upload file
                setTimeout(() => {
                    performFileUpload(file);
                }, 1500);
            } else {
                console.log('Document uploaden button not found, trying to find it...');
                // Log what we can see for debugging
                console.log('Available text:', iframeDoc.body.textContent);
                showNotification('Document uploaden knop niet gevonden', 'error');
            }
        } catch (error) {
            console.error('Error clicking Document uploaden:', error);
            showNotification('Fout bij navigatie: ' + error.message, 'error');
        }
    }

    function performFileUpload(file) {
        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        let fileInput = null;

        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                fileInput = iframeDoc.querySelector('input[type="file"]');
            } catch (error) {
                console.error('Cannot access iframe:', error);
                showNotification('Kan iframe niet benaderen', 'error');
                return;
            }
        }

        if (fileInput) {
            // Set the file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            // Trigger events
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));

            showNotification('✓ Bestand toegevoegd: ' + file.name, 'success');

            // FEATURE #4: Auto-click "Verder" after upload
            setTimeout(() => {
                autoClickVerderButton();
            }, 500);
        } else {
            showNotification('Upload veld niet gevonden', 'error');
        }
    }

    // FEATURE #4: Auto-click "Verder" button with safeguard
    function autoClickVerderButton() {
        if (!isOnDocumentUploadPage()) {
            console.log('Not on document upload page, skipping auto-click');
            return;
        }

        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const buttons = Array.from(iframeDoc.querySelectorAll('button, input[type="submit"], input[type="button"]'));

            const verderButton = buttons.find(el => {
                const text = (el.textContent || el.value || '').toLowerCase();
                return text.includes('verder') || text.includes('upload') || text.includes('volgende');
            });

            if (verderButton) {
                console.log('Auto-clicking Verder button');
                verderButton.click();
                showNotification('→ Verder...', 'success');

                // Wait and check if we need to click Verder again (for step 2 -> step 3)
                setTimeout(() => {
                    checkAndAutoClickSecondVerder();
                }, 2000);
            } else {
                showNotification('Klik handmatig op Verder', 'info');
            }
        } catch (error) {
            console.error('Error auto-clicking Verder:', error);
        }
    }

    // Auto-click second "Verder" button (from control step to description step)
    function checkAndAutoClickSecondVerder() {
        if (!isOnDocumentUploadPage()) return;

        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const text = iframeDoc.body.textContent || '';

            // Check if we're on a control/preview step (not the final form)
            const isControlStep = !isOnDescriptionScreen() &&
                                 (text.includes('Controleer') || text.includes('Preview') ||
                                  iframeDoc.querySelector('button, input[type="submit"]'));

            if (isControlStep) {
                const buttons = Array.from(iframeDoc.querySelectorAll('button, input[type="submit"], input[type="button"]'));
                const verderButton = buttons.find(el => {
                    const text = (el.textContent || el.value || '').toLowerCase();
                    return text.includes('verder') || text.includes('volgende') || text.includes('doorgaan');
                });

                if (verderButton) {
                    console.log('Auto-clicking second Verder button');
                    verderButton.click();
                    showNotification('→ Naar beschrijving...', 'success');

                    // Wait and auto-fill description
                    setTimeout(() => {
                        autoFillDescription();
                    }, 1500);
                }
            }
        } catch (error) {
            console.error('Error with second Verder:', error);
        }
    }

    // FEATURE #5: Auto-fill filename in "Omschrijving" field
    function autoFillDescription() {
        if (!uploadedFileName) return;
        if (!isOnDocumentUploadPage()) return;

        const iframe = document.querySelector('iframe#panelBackCompatibility-frame');
        if (!iframe) return;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            // Find Omschrijving field (try multiple selectors)
            const omschrijvingField =
                iframeDoc.querySelector('input[name*="omschrijving" i]') ||
                iframeDoc.querySelector('input[id*="omschrijving" i]') ||
                iframeDoc.querySelector('textarea[name*="omschrijving" i]') ||
                iframeDoc.querySelector('input[name*="description" i]') ||
                iframeDoc.querySelector('textarea');

            if (omschrijvingField && !omschrijvingField.value) {
                omschrijvingField.value = uploadedFileName;
                omschrijvingField.dispatchEvent(new Event('input', { bubbles: true }));
                omschrijvingField.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('Auto-filled description:', uploadedFileName);
                showNotification('✓ Omschrijving ingevuld: ' + uploadedFileName, 'success');
            }
        } catch (error) {
            console.error('Error auto-filling description:', error);
        }
    }

    // Monitor page changes to trigger auto-fill when needed
    function observePageChanges() {
        const observer = new MutationObserver(() => {
            if (uploadedFileName && isOnDescriptionScreen()) {
                autoFillDescription();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const colors = {
            success: '#4a8708',
            error: '#a94442',
            info: '#0275d8'
        };

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${colors[type]};
            color: white;
            border-radius: 4px;
            z-index: 100000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
})();
