// @ts-check
/// <reference path="../shared/settings.js" />

// Run the script
addCoAuthorsButtonToMergeForm();
// Re-run the script when navigating between pages
document.addEventListener('turbo:render', addCoAuthorsButtonToMergeForm);

/**
 * Create the UI for adding co-authors.
 * @param {HTMLElement} root
 * @param {boolean} isNewMergeExperience
 */
function createCoAuthorsUI(root, isNewMergeExperience) {
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
				isNewMergeExperience ? "textarea" : "textarea#merge_message_field",
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
	if (isNewMergeExperience) container.classList.add('mt-3');
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
 * @param {boolean} isNewMergeExperience Whether or not the new merge experience is being used.
 */
function addCoAuthorsButton(root, isNewMergeExperience) {
	const commitTitleInput = root.querySelector(
		isNewMergeExperience
			? "div:has(> label):nth-child(1)"
			: 'input[name="commit_title"]',
	);
	if (!commitTitleInput || root.querySelector('[data-coauthors-button]')) {
		return;
	}
	const button = createCoAuthorsUI(root, isNewMergeExperience);
	button.setAttribute('data-coauthors-button', '');
	commitTitleInput.insertAdjacentElement('afterend', button);
}

/**
 * Look for the PR merge form and add monitor it to add the co-authors button when possible.
 */
function addCoAuthorsButtonToMergeForm() {
	const newMergeExperienceContainer =
		/** @type {HTMLDivElement | null} */ document.querySelector(
			'.pull-discussion-timeline [data-testid="mergebox-partial"]',
		);
	const element = /** @type {HTMLDivElement | null} */ (
		newMergeExperienceContainer ??
			document.querySelector('.discussion-timeline-actions')
	);
	if (!element) return;

	const isNewMergeExperience = !!newMergeExperienceContainer;
	const observer = new MutationObserver(() => {
		addCoAuthorsButton(element, isNewMergeExperience);
	});
	observer.observe(element, { subtree: true, childList: true });
	addCoAuthorsButton(element, isNewMergeExperience);
}
