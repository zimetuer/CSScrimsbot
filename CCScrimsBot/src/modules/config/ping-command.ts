import { SlashCommandBuilder, EmbedBuilder, userMention, Guild, GuildMember, bold } from "discord.js"
import { 
    SlashCommand, 
    Config, 
    MessageOptionsBuilder,
    ComponentInteraction,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    PositionRole,
    SlashCommandInteraction,
    TextUtil,
} from "lib"

import {  Positions, RANKS } from "@Constants"

const Options = {
    server: "server",
    tier: "tier"
}

const Ping = {
    ogar: "<@1301911691470176277>",
    profesjonalista: "<@1301911895862939680>",
    koks: "<@1301912006558748742>"
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("vduel") // Command name
        .setDescription("Command for duel configurations") // Command description
        .addStringOption((option) =>
            option
                .setName(Options.tier)
                .setDescription("Specify the duel tier") // Description for the tier option
                .setRequired(true)
                .addChoices(
                    { name: "Ogar", value: "Ogar <@1301911691470176277>" },
                    { name: "Profesjonalista", value: "Profesjonalista <@1301911895862939680>" },
                    { name: "Koks", value: "Koks <@1301912006558748742>" }
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

    config: { permissions: { positionLevel: Positions.Staff } },

    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true })
    
        // Retrieve the options provided by the user
        const tier = interaction.options.getString(Options.tier, true)
        const server = interaction.options.getString(Options.server, true)
        
        // Fetch guild-specific configuration (example logic)
        const guildConfig = Config.cache.filter((v) => v.guildId === interaction.guildId)
        
        // Check if there's any configuration data to display
        if (!guildConfig.length) {
            return interaction.editReply("*Nothing to see here.*")
        }
        

        // Map the guild configuration into a formatted string
        const configDescription = guildConfig
            .map((v) =>
                `\`•\` **${v.type}:** ${v.parsedValue()}` +
                (v.clientId ? ` (${userMention(v.clientId)})` : "")
            )
            .join("\n")




        // Create an embed displaying the user-selected tier, server, and config details
        const embed = new EmbedBuilder()
            .setTitle(`${tier} Vouch Duel`)
            .setColor("#00d8ff")
            .setDescription(
                `**Tier:** ${tier}\n` +
                `**Nazwa Serwera:** ${server}\n\n` +
                ` ` +
                ` ` +
                configDescription
            )


    
        // Send the embed as a reply
        return interaction.editReply({ embeds: [embed] })
    },
})
