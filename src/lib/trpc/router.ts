import * as middlewares from './middlewares/auth';
import { t } from './t';
import { z } from 'zod';
import {
	getGithubRepositories,
	getGithubRepository,
	getRepoFileTree
} from '$lib/server/github/services';
import { getGithubToken, getUserByUsername } from '$lib/server/prisma/users/service';
import { fetchGithubRepositoryByName, fetchRepoFileTree } from '$lib/server/github/api';
import {
	getConfigBySlug,
	getConfigsByUsername,
	getConfigsForPlugin,
	getNeovimConfigsWithDotfyleShield,
	getNewestNeovimConfigs,
	searchNeovimConfigs
} from '$lib/server/prisma/neovimconfigs/service';
import {
	getAllNeovimPluginNames,
	getAllPluginCategories,
	getPlugin,
	getPluginsByAuthor,
	getPluginsByCategory,
	getPluginsBySlug,
	getPluginsWithDotfyleShield,
	getPopularPlugins,
	getReadme,
	searchPlugins,
	upsertNeovimPlugin
} from '$lib/server/prisma/neovimplugins/service';
import { getPluginSyncer, PluginSyncer } from '$lib/server/sync/plugins/sync';
import { sanitizeHtml, hasBeenOneDay, isAdmin } from '$lib/utils';
import {
	generateTwinIssue,
	updateTwinIssue,
	publishTwinIssue,
	getLatestTwinIssue
} from '$lib/trpc/domains/twin';

import { TRPCError } from '@trpc/server';
import {
	syncExistingRepoInfo,
	syncInitialRepoInfo,
	syncReadme,
	validateConfigPath
} from '$lib/server/nvim-sync/config/syncRepoInfo';
import { getNeovimConfigSyncer } from '$lib/server/nvim-sync/config/NeovimConfigSyncer';
import { InitFileFinder, InitFileNames } from '$lib/server/nvim-sync/config/InitFileFinder';
import {
	getLanguageServersBySlug,
	listLanguageServers
} from '$lib/server/prisma/languageservers/service';
import {
	getBreakingChangesByPlugin,
	getPosts,
	getTwinByIssue,
	getTwinPosts
} from '$lib/server/prisma/posts/services';
import { getMediaForPlugin } from '$lib/server/prisma/media/service';
import { marked } from 'marked';
import { validateRepositoryDataIsNeovimPlugin } from '$lib/validation';
import { PluginDTO } from '$lib/server/prisma/neovimplugins/schema';
import { prismaClient } from '$lib/server/prisma/client';

export const router = t.router({
	syncPlugin: t.procedure
		.use(middlewares.isAuthenticated)
		.input((input: unknown) => {
			return z
				.object({
					owner: z.string(),
					name: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { owner, name }, ctx }) => {
			const user = ctx.getAuthenticatedUser();
			const syncer = await getPluginSyncer(user, owner, name);
			return syncer.sync();
		}),
	getPluginsByCategory: t.procedure
		.input((input: unknown) => {
			return z.string().parse(input);
		})
		.query(async ({ input: category }) => {
			return getPluginsByCategory(category);
		}),
	getPopularPlugins: t.procedure.query(async () => {
		return getPopularPlugins();
	}),
	listPluginCategories: t.procedure.query(async () => {
		return getAllPluginCategories();
	}),
	listLanguageServers: t.procedure.query(async () => {
		return listLanguageServers();
	}),
	recentPluginsWithDotfyleShields: t.procedure.query(() => {
		return getPluginsWithDotfyleShield();
	}),
	recentConfigsWithDotfyleShields: t.procedure.query(() => {
		return getNeovimConfigsWithDotfyleShield();
	}),
	searchPlugins: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					query: z.string().optional(),
					categories: z.array(z.string()).default([]),
					sorting: z.enum(['new', 'popular', 'trending']),
					page: z.number().default(1),
					take: z.number().max(10).optional()
				})
				.parse(input);
		})
		.query(async ({ input }) => {
			const plugins = await searchPlugins(
				input.query,
				input.categories,
				input.sorting,
				input.page,
				input.take
			);
			return plugins;
		}),
	getConfigsForPlugin: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					owner: z.string(),
					name: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { owner, name } }) => {
			return getConfigsForPlugin(owner, name, 4);
		}),
	getPlugin: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					owner: z.string(),
					name: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { owner, name } }) => {
			return getPlugin(owner, name);
		}),
	getReadme: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					owner: z.string(),
					name: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { owner, name } }) => {
			const markdown = await getReadme(owner, name);
			const html = marked(markdown);
			return sanitizeHtml(html);
		}),
	getLanguageServersBySlug: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					username: z.string(),
					slug: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { username, slug } }) => {
			return getLanguageServersBySlug(username, slug);
		}),
	getPluginsBySlug: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					username: z.string(),
					slug: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { username, slug } }) => {
			return getPluginsBySlug(username, slug);
		}),
	getConfigBySlug: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					username: z.string(),
					slug: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { username, slug } }) => {
			return getConfigBySlug(username, slug).catch(() => {
				throw new TRPCError({
					message: 'config not found',
					code: 'NOT_FOUND'
				});
			});
		}),
	getConfigsByUsername: t.procedure
		.input((input: unknown) => {
			return z.string().parse(input);
		})
		.query(async ({ input: username }) => {
			return getConfigsByUsername(username);
		}),
	getAuthoredPluginsByUsername: t.procedure
		.input((input: unknown) => {
			return z.string().parse(input);
		})
		.query(async ({ input: username }) => {
			return getPluginsByAuthor(username);
		}),
	getUserByUsername: t.procedure
		.input((input: unknown) => {
			return z.string().parse(input);
		})
		.query(async ({ input: username }) => {
			return getUserByUsername(username).catch(() => {
				throw new TRPCError({
					message: 'user not found',
					code: 'NOT_FOUND'
				});
			});
		}),
	getUser: t.procedure.query(async ({ ctx }) => {
		return ctx.user;
	}),
	getRepositories: t.procedure.use(middlewares.isAuthenticated).query(async ({ ctx }) => {
		const user = ctx.getAuthenticatedUser();
		const plugins = await searchPlugins();
		const pluginNamesArr = plugins.data
			.filter((p) => p.category !== 'preconfigured')
			.map((p) => p.name);
		const pluginNames = new Set(pluginNamesArr);
		pluginNames.delete('vim');
		pluginNames.delete('nvim');
		pluginNames.delete('neovim');
		return (await getGithubRepositories(user)).filter((r) => !pluginNames.has(r.name));
	}),
	getNewestConfigs: t.procedure.query(async () => {
		const configs = await getNewestNeovimConfigs();
		return configs;
	}),
	searchConfigs: t.procedure
		.input((input: unknown) => {
			return z
				.object({
					query: z.string().optional(),
					plugins: z.array(z.string()).optional(),
					languageServers: z.array(z.string()).optional(),
					sorting: z.enum(['top', 'new', 'plugins']),
					page: z.number().default(1),
					take: z.number().optional()
				})
				.parse(input);
		})
		.query(async ({ input: { query, plugins, sorting, page, take, languageServers } }) => {
			const configs = await searchNeovimConfigs({
				query,
				plugins,
				sorting,
				page,
				take,
				languageServers
			});
			return configs;
		}),
	getPluginIdentifiers: t.procedure.query(async () => {
		return getAllNeovimPluginNames();
	}),
	syncExistingNeovimConfig: t.procedure
		.use(middlewares.isAuthenticated)
		.input((input: unknown) => {
			return z
				.object({
					owner: z.string(),
					slug: z.string()
				})
				.parse(input);
		})
		.query(async ({ ctx, input }) => {
			const user = ctx.getAuthenticatedUser();
			const configBeforeSync = await getConfigBySlug(input.owner, input.slug);
			if (!hasBeenOneDay(configBeforeSync.lastSyncedAt.toString())) {
				throw new TRPCError({ code: 'FORBIDDEN' });
			}
			const token = await getGithubToken(user.id);
			const config = await syncExistingRepoInfo(token, configBeforeSync);
			await syncReadme(token, config);
			const syncer = await getNeovimConfigSyncer(user, config);
			return await syncer.treeSync();
		}),
	createNeovimConfig: t.procedure
		.use(middlewares.isAuthenticated)
		.input((input: unknown) => {
			return z
				.object({
					initFile: z.nativeEnum(InitFileNames),
					root: z.string(),
					repo: z.string(),
					branch: z.string()
				})
				.parse(input);
		})
		.query(async ({ ctx, input }) => {
			const user = ctx.getAuthenticatedUser();
			const token = await getGithubToken(user.id);
			const tree = await fetchRepoFileTree(token, user.username, input.repo, input.branch);
			validateConfigPath(tree, input.root ? `${input.root}/${input.initFile}` : input.initFile);
			const config = await syncInitialRepoInfo(
				user,
				user.username,
				input.repo,
				input.root,
				input.initFile
			);
			await syncReadme(token, config);
			const syncer = await getNeovimConfigSyncer(user, config);
			return await syncer.treeSync();
		}),
	findRepoInitFiles: t.procedure
		.use(middlewares.isAuthenticated)
		.input((input: unknown) => {
			return z.object({ repo: z.string(), branch: z.string() }).parse(input);
		})
		.query(async ({ ctx, input }) => {
			const user = ctx.getAuthenticatedUser();
			const root = await getRepoFileTree(user, input.repo, input.branch);
			const initFiles = new InitFileFinder().findAllInitFile(root);
			return initFiles;
		}),

	getPosts: t.procedure
		.input((input: unknown) => {
			return z.object({ type: z.enum(['breaking-change', 'twin']) }).parse(input);
		})
		.query(async ({ input: { type } }) => {
			return getPosts(type, 6);
		}),

	getTwinPosts: t.procedure
		.input((input: unknown) => {
			return z.object({ page: z.number() }).parse(input);
		})
		.query(async ({ input: { page } }) => {
			return getTwinPosts(page);
		}),

	getTwinByIssue: t.procedure
		.input((input: unknown) => {
			return z.object({ issue: z.number() }).parse(input);
		})
		.query(async ({ input: { issue } }) => {
			const post = await getTwinByIssue(issue);
			return post;
		}),
	getBreakingCommits: t.procedure
		.input((input: unknown) => {
			return z.object({ owner: z.string(), name: z.string() }).parse(input);
		})
		.query(async ({ input: { owner, name } }) => {
			return getBreakingChangesByPlugin(owner, name, 3);
		}),
	getMediaForPlugin: t.procedure
		.input((input: unknown) => {
			return z.object({ owner: z.string(), name: z.string() }).parse(input);
		})
		.query(async ({ input: { owner, name } }) => {
			return getMediaForPlugin(owner, name);
		}),
	generateTwinIssue,
	updateTwinIssue,
	publishTwinIssue,
	getLatestTwinIssue,
	getGitHubRepository: t.procedure
		.use(middlewares.isAuthenticated)
		.use(middlewares.isAdmin)
		.input((input: unknown) => {
			return z.object({ owner: z.string(), name: z.string() }).parse(input);
		})
		.query(async ({ input: { owner, name }, ctx }) => {
			const repository = await getGithubRepository(ctx.user!.id, owner, name);
			return repository;
		}),
	createNeovimPlugin: t.procedure
		.use(middlewares.isAuthenticated)
		.use(middlewares.isAdmin)
		.input((input: unknown) => {
			// TODO: when making this public we can not just use any string for category
			// we have to validate that it is a category currently in se
			return z
				.object({
					owner: z.string(),
					name: z.string(),
					category: z.string()
				})
				.parse(input);
		})
		.query(async ({ input: { owner, name, category }, ctx }) => {
			const token = await getGithubToken(ctx.user!.id);
			const repository = await fetchGithubRepositoryByName(token, owner, name);
			if (!isAdmin(ctx!.user)) {
				validateRepositoryDataIsNeovimPlugin(repository);
			}
			const pluginDTO = {
				type: 'github',
				source: 'manually-created',
				category,
				link: repository.html_url,
				owner,
				name,
				shortDescription: repository.description ?? ''
			};
			const plugin = await upsertNeovimPlugin(PluginDTO.parse(pluginDTO));
			return new PluginSyncer(token, {
				...plugin,
				configCount: 0,
				media: []
			}).sync();
		}),
	deleteMedia: t.procedure
		.use(middlewares.isAuthenticated)
		.use(middlewares.isAdmin)
		.input((input: unknown) => {
			return z
				.object({
					id: z.number()
				})
				.parse(input);
		})
		.query(async ({ input: { id } }) => {
			await prismaClient.media.delete({ where: { id } });
		})
});

export type Router = typeof router;
