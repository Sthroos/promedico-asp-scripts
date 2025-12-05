// ==UserScript==
// @name         Promedico ASP - Zorgdomein Quick Menu
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Add Zorgdomein menu with Lab/Röntgen/Echo options
// @match        https://www.promedico-asp.nl/promedico/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Get the content iframe
    function getContentIframe() {
        return document.getElementById('panelBackCompatibility-frame');
    }

    // Check if we're on the contact processing page
    function isOnContactPage() {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return false;
        
        try {
            const url = iframe.contentDocument.location.href;
            // Check for any medischdossier.journaal page
            return url.includes('medischdossier.journaal');
        } catch(e) {
            return false;
        }
    }

    // Navigate to Verwijzen and start the ZorgDomein flow
    function navigateToZorgDomein(specialisme, targetUrl, callback) {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const actionButtons = doc.getElementById('actionbuttons');
        if (!actionButtons) return;

        const allClickable = actionButtons.querySelectorAll('td.actie');
        let verwijzenButton = null;
        for (let td of allClickable) {
            if (td.textContent.trim().includes('Verwijzen')) {
                verwijzenButton = td;
                break;
            }
        }

        if (!verwijzenButton) return;

        verwijzenButton.click();

        setTimeout(() => {
            fillSpecialismeAndClickZorgDomein(specialisme, targetUrl, callback);
        }, 1000);
    }

    // Fill the specialisme field and click Via ZorgDomein
    function fillSpecialismeAndClickZorgDomein(specialisme, targetUrl, callback) {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        const specMnemField = doc.getElementById('specMnem');
        if (specMnemField) {
            specMnemField.value = specialisme;
            specMnemField.dispatchEvent(new Event('input', { bubbles: true }));
            specMnemField.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const script = doc.createElement('script');
        script.textContent = `
            (function() {
                if (typeof disableScreen !== 'function') {
                    window.disableScreen = function() { return true; };
                }

                var button = document.getElementById('action_via zorgDomein');
                if (button) {
                    button.click();
                    setTimeout(function() {
                        button.click();
                    }, 200);
                }
            })();
        `;
        doc.head.appendChild(script);
        script.remove();

        setTimeout(() => {
            clickScriptZorgDomein(targetUrl, callback);
        }, 1500);
    }

    // Click the Script_ZorgDomein button OR open target URL directly
    function clickScriptZorgDomein(targetUrl, callback) {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Just open the target URL directly in a new window
        if (targetUrl) {
            window.open(targetUrl, '_blank');
            if (callback) callback();
        } else {
            // Fallback: click the button normally
            const zorgDomeinButton = doc.getElementById('Script_ZorgDomein');
            if (zorgDomeinButton) {
                zorgDomeinButton.click();
                if (callback) callback();
            }
        }
    }

    // Create the Zorgdomein button
    function createZorgdomeinButton() {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Check if already added
        if (doc.getElementById('zorgdomein-button')) return;

        // Find the actionbuttons container
        const actionButtons = doc.getElementById('actionbuttons');
        if (!actionButtons) return;

        // Find all clickable elements
        const allClickable = actionButtons.querySelectorAll('td.actie');

        // Find "Verwijzen" button
        let verwijzenButton = null;
        for (let td of allClickable) {
            if (td.textContent.trim().includes('Verwijzen')) {
                verwijzenButton = td;
                break;
            }
        }

        if (!verwijzenButton) return;

        // Clone the Verwijzen button structure
        const zorgdomeinButton = verwijzenButton.cloneNode(true);
        zorgdomeinButton.id = 'zorgdomein-button';

        // Update the text
        const innerText = zorgdomeinButton.querySelector('td[id$="_inner"]');
        if (innerText) {
            innerText.textContent = 'Zorgdomein';
            innerText.id = 'zorgdomein_inner';
        } else {
            const textTd = zorgdomeinButton.querySelector('td[style*="cursor"]');
            if (textTd) {
                textTd.textContent = 'Zorgdomein';
            }
        }

        // Clear onclick
        zorgdomeinButton.onclick = null;
        zorgdomeinButton.removeAttribute('onclick');

        // Add click handler to show submenu
        zorgdomeinButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showZorgdomeinMenu();
        });

        // Insert after Verwijzen button's parent row
        const parentRow = verwijzenButton.parentElement;

        if (parentRow.tagName === 'TR') {
            const newRow = doc.createElement('tr');
            newRow.appendChild(zorgdomeinButton);

            if (parentRow.nextSibling) {
                parentRow.parentNode.insertBefore(newRow, parentRow.nextSibling);
            } else {
                parentRow.parentNode.appendChild(newRow);
            }
        } else {
            if (verwijzenButton.nextSibling) {
                verwijzenButton.parentNode.insertBefore(zorgdomeinButton, verwijzenButton.nextSibling);
            } else {
                verwijzenButton.parentNode.appendChild(zorgdomeinButton);
            }
        }
    }

    // Show the Zorgdomein submenu
    function showZorgdomeinMenu() {
        const iframe = getContentIframe();
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Remove existing menu if present
        const existingMenu = doc.getElementById('zorgdomein-menu');
        if (existingMenu) {
            existingMenu.remove();
            return; // Toggle off
        }

        // Get the Zorgdomein button position
        const zorgdomeinButton = doc.getElementById('zorgdomein-button');
        if (!zorgdomeinButton) return;

        const buttonRect = zorgdomeinButton.getBoundingClientRect();

        // Create menu container
        const menu = doc.createElement('table');
        menu.id = 'zorgdomein-menu';
        menu.cellPadding = '0';
        menu.cellSpacing = '0';
        menu.style.cssText = `
            position: fixed;
            left: ${buttonRect.right + 5}px;
            top: ${buttonRect.top}px;
            width: 200px;
            background: white;
            border: 1px solid #ccc;
            box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
        `;

        const tbody = doc.createElement('tbody');

        // Menu items with specialisme codes and ZorgDomein URLs
        const items = [
            {
                text: 'Lab',
                submenu: null,
                code: 'LAB',
                url: 'https://www.zorgdomein.nl/zd/referral/choose-product/51d786ec-f6e1-4a9e-ae56-b485c498866f'
            },
            {
                text: 'Röntgen',
                code: 'RON',
                url: 'https://www.zorgdomein.nl/zd/referral/choose-product/YOUR_RONTGEN_ID',
                submenu: [
                    { text: 'Bovenste extremiteiten', code: 'RON', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/90118f1c-9172-4cf7-bd1b-e8d3f327018d' },
                    { text: 'Onderste extremiteiten', code: 'RON', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/00e30944-e4ce-44ba-9fc9-b892774908ed' },
                    { text: 'Thorax', code: 'RON', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/130dbc65-3198-41c9-a7c8-280e432806fe' }
                ]
            },
            {
                text: 'Echo',
                code: 'ECH',
                url: 'https://www.zorgdomein.nl/zd/referral/choose-product/YOUR_ECHO_ID',
                submenu: [
                    { text: 'Mammografie', code: 'ECH', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/e2dfb2ec-7151-42ac-90fa-0168e3cad179/1ELBEC' },
                    { text: 'Abdomen', code: 'ECH', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/10d7de37-09a8-454c-96b6-af52f2b7c352/1ELBEC' },
                    { text: 'Hoofd/hals', code: 'ECH', url: 'https://www.zorgdomein.nl/zd/referral/choose-product/1b86df11-ec4f-47ad-926d-0b71b80b7c9d/1ELBEC' },
                    { text: 'Vaginaal', code: 'ECH', url: 'https://www.zorgdomein.nl/zd/protocol/6c2767e0-de23-4afb-99cd-81d2acbf4727/1ELBEC' }
                ]
            }
        ];

        items.forEach(item => {
            const tr = doc.createElement('tr');
            const menuItem = createMenuItem(doc, item.text, item.submenu, item.code, item.url);
            tr.appendChild(menuItem);
            tbody.appendChild(tr);
        });

        menu.appendChild(tbody);
        doc.body.appendChild(menu);

        // Close menu when clicking outside
        doc.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && !zorgdomeinButton.contains(e.target)) {
                menu.remove();
                doc.removeEventListener('click', closeMenu);
            }
        });
    }

    // Create a menu item
    function createMenuItem(doc, text, submenu, code, url) {
        const item = doc.createElement('td');
        item.className = 'actie';
        item.style.cssText = `
            height: 30px;
            width: 200px;
            cursor: pointer;
        `;

        // Create inner table structure like original buttons
        const innerTable = doc.createElement('table');
        innerTable.cellPadding = '0';
        innerTable.cellSpacing = '0';
        innerTable.border = '0';
        innerTable.style.width = '200px';

        const innerTbody = doc.createElement('tbody');
        const innerTr = doc.createElement('tr');

        // Spacer
        const spacerTd1 = doc.createElement('td');
        spacerTd1.style.width = '15px';
        spacerTd1.innerHTML = '&nbsp;';

        // Icon
        const iconTd = doc.createElement('td');
        iconTd.align = 'left';
        iconTd.style.width = '24px';
        const icon = doc.createElement('img');
        icon.border = '0';
        icon.src = '/promedico/images/action.gif';
        icon.width = '24';
        icon.height = '14';
        iconTd.appendChild(icon);

        // Spacer
        const spacerTd2 = doc.createElement('td');
        spacerTd2.style.width = '5px';
        spacerTd2.innerHTML = '&nbsp;';

        // Text
        const textTd = doc.createElement('td');
        textTd.align = 'left';
        textTd.style.width = '140px';
        textTd.style.cursor = 'pointer';
        textTd.textContent = text;

        // Spacer
        const spacerTd3 = doc.createElement('td');
        spacerTd3.style.width = '15px';
        spacerTd3.innerHTML = '&nbsp;';

        innerTr.appendChild(spacerTd1);
        innerTr.appendChild(iconTd);
        innerTr.appendChild(spacerTd2);
        innerTr.appendChild(textTd);
        innerTr.appendChild(spacerTd3);
        innerTbody.appendChild(innerTr);
        innerTable.appendChild(innerTbody);
        item.appendChild(innerTable);

        // Hover effects
        item.addEventListener('mouseenter', function() {
            item.className = 'actieOver';

            // Show submenu if exists
            if (submenu) {
                showSubmenu(doc, item, submenu);
            }
        });

        item.addEventListener('mouseleave', function() {
            item.className = 'actie';
        });

        // Click handler
        item.addEventListener('click', function(e) {
            e.stopPropagation();

            // Close menu
            const mainMenu = doc.getElementById('zorgdomein-menu');
            if (mainMenu) mainMenu.remove();

            // Navigate to ZorgDomein with this specialisme code and URL
            navigateToZorgDomein(code, url, () => {
                // Callback after navigation completes
            });
        });

        return item;
    }

    // Show submenu
    function showSubmenu(doc, parentItem, items) {
        // Remove existing submenus
        const existingSubmenu = doc.getElementById('zorgdomein-submenu');
        if (existingSubmenu) {
            existingSubmenu.remove();
        }

        const submenu = doc.createElement('table');
        submenu.id = 'zorgdomein-submenu';
        submenu.cellPadding = '0';
        submenu.cellSpacing = '0';

        const parentRect = parentItem.getBoundingClientRect();

        // Calculate submenu height (approximate)
        const itemHeight = 31; // 30px height + 1px border
        const submenuHeight = items.length * itemHeight;

        // Check if submenu would go off bottom of screen
        const viewportHeight = doc.defaultView.innerHeight;
        const spaceBelow = viewportHeight - parentRect.top;
        const spaceAbove = parentRect.bottom;

        let topPosition;
        if (spaceBelow < submenuHeight && spaceAbove > submenuHeight) {
            // Not enough space below but enough above - align bottom of submenu with bottom of parent
            topPosition = parentRect.bottom - submenuHeight;
        } else if (spaceBelow < submenuHeight) {
            // Not enough space below or above - align with bottom of viewport
            topPosition = viewportHeight - submenuHeight - 10;
        } else {
            // Enough space below - normal positioning
            topPosition = parentRect.top;
        }

        submenu.style.cssText = `
            position: fixed;
            left: ${parentRect.right + 5}px;
            top: ${topPosition}px;
            width: 200px;
            background: white;
            border: 1px solid #ccc;
            box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
            z-index: 10001;
        `;

        const tbody = doc.createElement('tbody');

        items.forEach(item => {
            const tr = doc.createElement('tr');
            const subItem = doc.createElement('td');
            subItem.className = 'actie';
            subItem.style.cssText = `
                height: 30px;
                width: 200px;
                cursor: pointer;
            `;

            // Create inner table structure
            const innerTable = doc.createElement('table');
            innerTable.cellPadding = '0';
            innerTable.cellSpacing = '0';
            innerTable.border = '0';
            innerTable.style.width = '200px';

            const innerTbody = doc.createElement('tbody');
            const innerTr = doc.createElement('tr');

            const spacerTd1 = doc.createElement('td');
            spacerTd1.style.width = '15px';
            spacerTd1.innerHTML = '&nbsp;';

            const iconTd = doc.createElement('td');
            iconTd.align = 'left';
            iconTd.style.width = '24px';
            const icon = doc.createElement('img');
            icon.border = '0';
            icon.src = '/promedico/images/action.gif';
            icon.width = '24';
            icon.height = '14';
            iconTd.appendChild(icon);

            const spacerTd2 = doc.createElement('td');
            spacerTd2.style.width = '5px';
            spacerTd2.innerHTML = '&nbsp;';

            const textTd = doc.createElement('td');
            textTd.align = 'left';
            textTd.style.width = '140px';
            textTd.style.cursor = 'pointer';
            textTd.textContent = item.text;

            const spacerTd3 = doc.createElement('td');
            spacerTd3.style.width = '15px';
            spacerTd3.innerHTML = '&nbsp;';

            innerTr.appendChild(spacerTd1);
            innerTr.appendChild(iconTd);
            innerTr.appendChild(spacerTd2);
            innerTr.appendChild(textTd);
            innerTr.appendChild(spacerTd3);
            innerTbody.appendChild(innerTr);
            innerTable.appendChild(innerTbody);
            subItem.appendChild(innerTable);

            subItem.addEventListener('mouseenter', function() {
                subItem.className = 'actieOver';
            });

            subItem.addEventListener('mouseleave', function() {
                subItem.className = 'actie';
            });

            subItem.addEventListener('click', function(e) {
                e.stopPropagation();

                // Close all menus
                submenu.remove();
                const mainMenu = doc.getElementById('zorgdomein-menu');
                if (mainMenu) mainMenu.remove();

                // Navigate to ZorgDomein with this specialisme code and URL
                navigateToZorgDomein(item.code, item.url, () => {
                    // Callback after navigation completes
                });
            });

            tr.appendChild(subItem);
            tbody.appendChild(tr);
        });

        submenu.appendChild(tbody);
        doc.body.appendChild(submenu);

        // Remove submenu when mouse leaves parent item
        parentItem.addEventListener('mouseleave', function removeSubmenu() {
            setTimeout(() => {
                if (!submenu.matches(':hover')) {
                    submenu.remove();
                }
            }, 200);
            parentItem.removeEventListener('mouseleave', removeSubmenu);
        });
    }

    // Initialize
    function init() {
        // Monitor continuously - check every 2 seconds
        setInterval(() => {
            if (isOnContactPage()) {
                createZorgdomeinButton();
            }
        }, 2000);
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
