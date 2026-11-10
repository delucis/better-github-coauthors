// @ts-check
/// <reference path="../shared/settings.js" />

// Run the script
addCoAuthorsButtonToMergeForm();
// Re-run the script when the page changes, e.g. when navigating between pages or when a merge form is rendered
const observer = new MutationObserver(addCoAuthorsButtonToMergeForm);
observer.observe(document.documentElement, { subtree: true, childList: true });

/**
 * Create the UI for adding co-authors.
 * @param {HTMLElement} root
 * @param {boolean} isNewMergeForm
 */
function createCoAuthorsUI(root, isNewMergeForm) {
	const banner = document.createElement('div');
	banner.setAttribute('aria-live', 'polite');
	banner.classList.add('color-fg-subtle');

	let bannerTimeout;
	/**
	 * Display a temporary status update about the progress adding co-authors.
	 * @param {string} msg The message to display
	 * @param {'subtle' | 'success' | 'danger'} color The status color to use.
	 */
	const displayStatus = (msg, color = 'subtle') => {
		clearTimeout(bannerTimeout);
		banner.textContent = msg;
		banner.className = `color-fg-${color}`;
		bannerTimeout = setTimeout(() => (banner.textContent = ''), 5000);
	};

	const button = document.createElement('button');
	button.textContent = 'Add co-authors';
	button.classList.add('Button', 'Button--secondary', 'Button--small');
	button.type = 'button';
	button.addEventListener('click', async () => {
		displayStatus('Loading co-authors…');
		try {
			const settings = await getSettings();
			const { message, count } = await getCoAuthors(settings);
			/** @type {HTMLTextAreaElement | null} */
			const textArea = root.querySelector(
				isNewMergeForm ? "textarea" : "textarea#merge_message_field",
			);
			if (!textArea) {
				throw new Error('Couldn’t find commit message <textarea>');
			}
			// If enabled and we have co-authors to add, strip any existing co-authors from the textarea.
			if (settings.stripExistingCoAuthors && count > 0) {
				const coAuthorRegex = /^Co-authored-by:/i;
				textArea.value = textArea.value.split('\n').filter((line) => !coAuthorRegex.test(line)).join('\n');
			}
			// Append co-authors to textarea content.
			textArea.value = (textArea.value + '\n\n' + message).trim();
			// Notify event listeners that the <textarea> content changed.
			textArea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

			if (count === 0) {
				displayStatus('Found no co-authors to add');
			} else {
				displayStatus(`Added ${count} co-author${count === 1 ? '' : 's'}`, 'success');
			}
		} catch (error) {
			console.error('Error adding co-authors:', error);
			displayStatus('Something went wrong.', 'danger');
		}
	});
	// Build container
	const container = document.createElement('div');
	container.classList.add('d-flex', 'flex-items-center', 'gap-2');
	if (isNewMergeForm) container.classList.add('mt-3');
	container.append(button);
	container.append(banner);
	return container;
}

/**
 * Get participants for the current PR and generate `Co-authored-by` messages for them.
 * @param {Settings} settings
 */
async function getCoAuthors(settings) {
	const [, owner, repo, _pull, id] = window.location.pathname.split('/');
	const pullNumber = parseInt(id || '', 10);

	const [prData, comments, reviewComments, reviews] = await Promise.all([
		fetchGitHubAPI(`/repos/${owner}/${repo}/pulls/${pullNumber}`, settings),
		fetchGitHubAPI(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, settings),
		fetchGitHubAPI(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, settings),
		fetchGitHubAPI(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, settings),
	]);

	const participants = /** @type {Map<string, { name: string; email: string }>} */ (new Map());

	// Add commenters
	for (const { user } of [...comments, ...reviewComments, ...reviews]) {
		// Skip bot comments
		if (user.type === 'Bot') continue;
		// Skip PR author
		if (user.login === prData.user.login) continue;
		// Add commenters if not ignored
		if (!participants.has(user.login) && !settings.ignoredCoAuthors.includes(user.login)) {
			participants.set(user.login, {
				name: user.name || user.login,
				email: `${user.id}+${user.login}@users.noreply.github.com`,
			});
		}
	}

	const lines = Array.from(participants.values()).map(
		(p) => `Co-authored-by: ${p.name} <${p.email}>`
	);
	return { message: lines.join('\n'), count: lines.length };
}

/**
 * Simple wrapper around `fetch()` for making GitHub API requests, e.g. `fetchGitHubAPI('/repos/withastro')`.
 * Throws an error if the fetch does not succeed.
 * @param {string} endpoint GitHub API endpoint to fetch
 * @param {Settings} settings
 */
async function fetchGitHubAPI(endpoint, settings) {
	const headers = new Headers();
	headers.append('Accept', 'application/vnd.github.v3+json');
	if (settings.token) {
		headers.append('Authorization', `Bearer ${settings.token}`);
	}
	const response = await fetch(`https://api.github.com${endpoint}`, { headers });
	if (!response.ok) {
		throw new Error(`GitHub API request failed: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Create and add the co-authors button.
 * @param {HTMLElement} root Element to search within and add the co-authors button to.
 * @param {boolean} isNewMergeForm Whether or not the merge form is the one from the improved merge
 * experience (used in both the classic and new overview pages) instead of the legacy merge form.
 */
function addCoAuthorsButton(root, isNewMergeForm) {
	const commitTitleInput = root.querySelector(
		isNewMergeForm
			? "div:has(> label):nth-child(1)"
			: 'input[name="commit_title"]',
	);
	if (!commitTitleInput || root.querySelector('[data-coauthors-button]')) {
		return;
	}
	const button = createCoAuthorsUI(root, isNewMergeForm);
	button.setAttribute('data-coauthors-button', '');
	commitTitleInput.insertAdjacentElement('afterend', button);
}

/**
 * Look for the PR merge forms and add the co-authors button to them when possible.
 */
function addCoAuthorsButtonToMergeForm() {
	const mergeForms = /** @type {NodeListOf<HTMLDivElement>} */ (
		document.querySelectorAll(
			':is([role="dialog"], [data-testid="mergebox-border-container"]):has([data-dd-action-name$=".confirm_merge"])',
		)
	);
	// The improved merge experience form is used in the classic overview and in the merge dialog/side
	// panel of the new overview page.
	for (const form of mergeForms) addCoAuthorsButton(form, true);

	const legacyMergeForm = /** @type {HTMLDivElement | null} */ (
		document.querySelector('.discussion-timeline-actions')
	);
	if (legacyMergeForm) addCoAuthorsButton(legacyMergeForm, false);
}
