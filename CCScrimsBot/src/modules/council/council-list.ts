import { SlashCommandBuilder, EmbedBuilder, userMention } from "discord.js";
import { SlashCommand, Config, MessageOptionsBuilder } from "lib";
import { Positions } from "@Constants";

// Mocking fetchMCUsername as an example; replace with actual implementation
async function fetchMCUsername(userId: string): Promise<string> {
    return `MinecraftUser_${userId}`; // Replace with real fetching logic
}

const Options = {
    server: "server",
    tier: "tier"
};

// Map the tier values to display names
const tierNames: Record<"tier1" | "tier2" | "tier3", string> = {
    tier1: "Ogar",
    tier2: "Profesjonalista",
    tier3: "Koks"
};

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("vduel")        // Command name
        .setDescription("Command for duel configurations") // Command description
        .addStringOption((option) =>
            option
                .setName(Options.tier)
                .setDescription("Specify the duel tier") // Description for the tier option
                .setRequired(true)
                .addChoices(
                    { name: "Ogar", value: "tier1" },
                    { name: "Profesjonalista", value: "tier2" },
                    { name: "Koks", value: "tier3" }
                )
        )
        .addStringOption((option) =>
            option
                .setName(Options.server)
                .setDescription("Enter the server name") // Description for the server option
                .setRequired(true)
        )
        .setDefaultMemberPermissions("0")
        .setDMPermission(false),



    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Retrieve the options provided by the user and assert type as a union of known tier values
        const tierValue = interaction.options.getString(Options.tier, true) as "tier1" | "tier2" | "tier3";
        const server = interaction.options.getString(Options.server, true);

        // Map the tier value to its display name
        const tierName = tierNames[tierValue];
        
        // Fetch the user's Minecraft username
        const mcUsername = await fetchMCUsername(interaction.user.id);

        // Fetch guild-specific configuration (example logic)
        const guildConfig = Config.cache.filter((v) => v.guildId === interaction.guildId);
        
        // Check if there's any configuration data to display
        if (!guildConfig.length) {
            return interaction.editReply("No configuration data found for this guild.");
        }

        // Map the guild configuration into a formatted string
        const configDescription = ''; // Removed the mapping logic

        // Create an embed displaying the user-selected tier (display name), server, Minecraft username, and config details
        const embed = new EmbedBuilder()
            .setTitle(`${tierName} Vouch Duel`)
            .setColor("#00d8ff")
            .setDescription(
                `**Issued By:** ${interaction.user.username} (${mcUsername})\n` +
                `**Tier:** ${tierName}\n` +
                `**Server Name:** ${server}\n\n` +
                ` \n` + // Added title for clarity
                configDescription
            );

        // Send the embed as a reply
        return interaction.editReply({ embeds: [embed] });
    }
}); // Ensure this closing brace and parenthesis match the opening ones
