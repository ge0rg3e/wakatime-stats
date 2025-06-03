import 'dotenv/config';
import axios from 'axios';

// Types
type TimeRange = 'yesterday' | 'last_7_days' | 'last_30_days' | 'last_year';

interface Language {
	name: string;
	total_seconds: number;
}

interface WakaTimeStats {
	languages: Language[];
}

interface WakaTimeResponse {
	data: WakaTimeStats;
}

interface SummaryResponse {
	data: Array<{
		languages: Language[];
	}>;
}

interface GistResponse {
	files: Record<string, { filename: string; content: string }>;
}

// Configuration
const WAKATIME_CONFIG = {
	baseUrl: 'https://wakatime.com/api/v1/users/current',
	endpoints: {
		stats: (range: TimeRange) => `${WAKATIME_CONFIG.baseUrl}/stats/${range}`,
		summaries: (range: string) => `${WAKATIME_CONFIG.baseUrl}/summaries?range=${range}`
	}
} as const;

const PROGRESS_STYLES = {
	arrow: { filled: '▶', empty: '▷', blocks: 16 },
	hash: { filled: '#', empty: '-', blocks: 25 },
	default: { filled: '▰', empty: '▱', blocks: 14 }
} as const;

const GIST_TITLES: Record<TimeRange, string> = {
	yesterday: '☕ Yesterday Coding Stats',
	last_7_days: '☕ Last 7 Days Coding Stats',
	last_30_days: '☕ Last 30 Days Coding Stats',
	last_year: '☕ Last Year Coding Stats'
} as const;

// Utility for logging
const log = {
	info: (msg: string) => console.log(`ℹ️ ${msg}`),
	error: (msg: string) => console.error(`❌ ${msg}`)
};

// Get WakaTime API endpoint based on time range
const getWakaTimeEndpoint = (range: TimeRange) => (range === 'yesterday' ? WAKATIME_CONFIG.endpoints.summaries('yesterday') : WAKATIME_CONFIG.endpoints.stats(range));

// Get gist title based on time range
const getGistTitle = (range: TimeRange) => GIST_TITLES[range] || GIST_TITLES.last_7_days;

// Format duration
const formatDuration = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours ? `${hours} hrs ` : ''}${minutes ? `${minutes} mins` : ''}`.trim() || '0 mins';
};

// Create progress bar with different styles
const createProgressBar = (percentage: number) => {
	const style = PROGRESS_STYLES[(process.env.PROGRESS_STYLE?.toLowerCase() as keyof typeof PROGRESS_STYLES) || 'default'];
	const filled = Math.round((percentage / 100) * style.blocks);
	return style.filled.repeat(filled) + style.empty.repeat(style.blocks - filled);
};

// Format stats for gist
const formatStats = (stats: WakaTimeStats) =>
	stats.languages
		.slice(0, 5)
		.map((lang) => {
			const percentage = (lang.total_seconds / stats.languages.reduce((sum, l) => sum + l.total_seconds, 0)) * 100;
			return `${lang.name.padEnd(10)} ${formatDuration(lang.total_seconds).padEnd(14)} ${createProgressBar(percentage)}  ${percentage.toFixed(1)}%`;
		})
		.join('\n');

// Fetch WakaTime stats
const fetchWakaTimeStats = async () => {
	try {
		const timeRange: TimeRange = (process.env.TIME_RANGE as TimeRange) || 'last_7_days';
		const endpoint = getWakaTimeEndpoint(timeRange);

		const { data } = await axios.get<WakaTimeResponse | SummaryResponse>(endpoint, {
			headers: { Authorization: `Basic ${process.env.WAKATIME_TOKEN}` }
		});

		if (timeRange === 'yesterday') {
			const summaryData = data as SummaryResponse;
			return {
				languages: summaryData.data[0]?.languages || []
			};
		}

		return (data as WakaTimeResponse).data;
	} catch (error) {
		console.log({ error });
		log.error(`Failed to fetch WakaTime stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return null;
	}
};

// Fetch and update gist filename
const fetchGistFilename = async () => {
	try {
		const { data } = await axios.get<GistResponse>(`https://api.github.com/gists/${process.env.GIST_ID}`, {
			headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` }
		});

		const timeRange: TimeRange = (process.env.TIME_RANGE as TimeRange) || 'last_7_days';
		const newFilename = getGistTitle(timeRange);

		const oldFilename = Object.keys(data.files)[0];
		if (!oldFilename) throw new Error('No files found in the gist');

		if (oldFilename !== newFilename) {
			await axios.patch(
				`https://api.github.com/gists/${process.env.GIST_ID}`,
				{
					files: {
						[oldFilename]: { filename: newFilename, content: data.files[oldFilename].content }
					}
				},
				{
					headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` }
				}
			);
		}

		return newFilename;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		log.error(`Failed to fetch/update gist filename: ${message}`);
		throw new Error(message);
	}
};

// Update gist
const updateGist = async (stats: WakaTimeStats | null, filename: string) => {
	const content = stats ? formatStats(stats) : 'No WakaTime stats available';

	try {
		await axios.patch(
			`https://api.github.com/gists/${process.env.GIST_ID}`,
			{ files: { [filename]: { content } } },
			{ headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` } }
		);
		log.info('Gist updated successfully');
	} catch (error) {
		log.error(`Failed to update gist: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
};

// Main execution
const main = async () => {
	try {
		log.info('Fetching WakaTime stats and gist filename...');
		const [stats, filename] = await Promise.all([fetchWakaTimeStats(), fetchGistFilename()]);
		log.info('Updating gist with latest stats...');
		await updateGist(stats, filename);
	} catch (error) {
		log.error(`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
};

main();
