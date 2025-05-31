import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';

// Interfaces
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
interface GistResponse {
	files: Record<string, { filename: string; content: string }>;
}

// Utility for logging
const log = {
	info: (msg: string) => console.log(`ℹ️   ${msg}`),
	error: (msg: string) => console.error(`❌ ${msg}`)
};

// Fetch WakaTime stats
const fetchWakaTimeStats = async (): Promise<WakaTimeStats | null> => {
	try {
		const { data }: AxiosResponse<WakaTimeResponse> = await axios.get('https://wakatime.com/api/v1/users/current/stats/last_7_days', {
			headers: { Authorization: `Basic ${process.env.WAKATIME_TOKEN}` }
		});
		return data.data;
	} catch (error) {
		log.error(`Failed to fetch WakaTime stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return null;
	}
};

// Fetch gist filename
const fetchGistFilename = async (): Promise<string> => {
	try {
		const { data }: AxiosResponse<GistResponse> = await axios.get(`https://api.github.com/gists/${process.env.GIST_ID}`, {
			headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` }
		});
		const filename = Object.keys(data.files)[0];
		if (!filename) throw new Error('No files found in the gist');
		return filename;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		log.error(`Failed to fetch gist filename: ${message}`);
		throw new Error(message);
	}
};

// Format duration (seconds to "X hrs Y mins")
const formatDuration = (seconds: number): string => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours ? `${hours} hrs ` : ''}${minutes ? `${minutes} mins` : ''}`.trim() || '0 mins';
};

// Create progress bar
const createProgressBar = (percentage: number): string => {
	const blocks = 14;
	const filled = Math.round((percentage / 100) * blocks);
	return '▰'.repeat(filled) + '▱'.repeat(blocks - filled);
};

// Format stats for gist
const formatStats = (stats: WakaTimeStats): string =>
	stats.languages
		.slice(0, 5)
		.map((lang) => {
			const percentage = (lang.total_seconds / stats.languages.reduce((sum, l) => sum + l.total_seconds, 0)) * 100;
			return `${lang.name.padEnd(10)} ${formatDuration(lang.total_seconds).padEnd(14)} ${createProgressBar(percentage)}  ${percentage.toFixed(1)}%`;
		})
		.join('\n');

// Update gist
const updateGist = async (stats: WakaTimeStats | null, filename: string): Promise<void> => {
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
const main = async (): Promise<void> => {
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
