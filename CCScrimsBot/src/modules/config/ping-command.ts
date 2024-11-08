import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { 
    SlashCommand, 
    Config, 
    userMention
} from "lib";
import { UserProfile, MojangClient } from "lib";
import { DateTime } from "luxon"; // Ensure luxon is installed and properly imported

// Define options for command parameters
const Options = {
    server: "server",
    tier: "tier",
    tryb: "tryb"
};

// Map tier values to display names and user mentions (corrected for role mentions)
const TierDisplayNames = {
    tier1: { name: "Ogar", mention: "<@&1301911691470176277>" }, // This is a role mention
    tier2: { name: "Profesjonalista", mention: "<@&1301911895862939680>" },
    tier3: { name: "Koks", mention: "<@&1301912006558748742>" },
};

const TrybDisplayNames = {
    tryb1: "1v1",
    tryb2: "2v2",
    tryb3: "3v3",
    tryb4: "4v4",
};

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("vduel")
        .setDescription("Vouch duel komenda")
        .addStringOption((option) =>
            option
                .setName(Options.tier)
                .setDescription("Wybierz Tier")
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
                .setDescription("Wpisz swoj serwer")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName(Options.tryb)
                .setDescription("Wybierz tryb")
                .setRequired(true)
                .addChoices(
                    { name: "1v1", value: "tryb1" },
                    { name: "2v2", value: "tryb2" },
                    { name: "3v3", value: "tryb3" },
                    { name: "4v4", value: "tryb4" }
                )
        )
        .setDefaultMemberPermissions("0")
        .setDMPermission(false),

    config: { permissions: { positionLevel: 0 } }, // Adjust this if Positions.Staff is available

    async handler(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const profile = UserProfile.cache.get(interaction.user.id);
            if (!profile || !profile.mcUUID) {
                return interaction.editReply({
                    content: "Register kurwo jebana.",
                });
            }

            const minecraft = await MojangClient.uuidToProfile(profile.mcUUID);
            const ign = minecraft ? minecraft.name : "Nie znany nick";

            // Retrieve the user’s timezone offset in minutes and calculate the local time
            const offsetMinutes = profile.offset || 0; // Assuming offset is stored in minutes
            const userTime = DateTime.utc().plus({ minutes: offsetMinutes }).toFormat("h:mm a");

            const tierValue = interaction.options.getString(Options.tier, true);
            const server = interaction.options.getString(Options.server, true);
            const TrybValue = interaction.options.getString(Options.tryb, true);

            const tier = TierDisplayNames[tierValue];
            const tryb = TrybDisplayNames[TrybValue] || "Zły tryb"; // Default to "Unknown Tryb" if it's invalid

            // Create the embed with the tier mention and other details
            const embed = new EmbedBuilder()
                .setTitle(`${tier.name} Vouch Duel`)
                .setColor("#00d8ff")
                .setDescription(
                    `> **IGN:** ${ign} | _${userTime}_ \n` +
                    `> **Tier:** ${tier.name} ${tier.mention}\n` +  // This should ping the role properly
                    `> **Nazwa Serwera:** ${server}\n` +
                    `> **Tryb:** ${tryb}\n\n` +
                    `\n\n`
                )
                .setFooter({ text: "Czas +/- 10 min" });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Problemyyy:", error);
            return interaction.editReply({
                content: "Problem z czasem",
            });
        }
    }
});
