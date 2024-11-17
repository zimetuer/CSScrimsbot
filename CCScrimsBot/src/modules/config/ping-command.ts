import { COUNCIL_PERMISSIONS, Positions, RANKS } from "@Constants";
import { group } from "console";
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, User } from "discord.js";
import { SlashCommand, Config, PermissionsManager } from "lib";
import { UserProfile, MojangClient } from "lib";
import { DateTime } from "luxon";

// Define options for command parameters
const Options = {
    server: "server",
    tier: "tier",
    tryb: "tryb",
    osoba: "osoba"
};

// onst COUNCIL_PERMISSIONS = [
    //"ADMINISTRATOR", // Example of including a default admin permission
   // "1298256878849228860", // Specific group role ID 1
    //"1298257325450199152", // Specific group role ID 2
  //  "1298257533743665172"  // Specific group role ID 3
// ];


// Map tier values to display names and user mentions
const TierDisplayNames = {
    tier1: { name: "Ogar", mention: "<@&1301911691470176277>" },
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
        .addUserOption((option) =>
            option
                .setName(Options.osoba)
                .setDescription("Wybierz osobę do gry")
                .setRequired(false)
        )
        .setDMPermission(false),

        config: { permissions: COUNCIL_PERMISSIONS },

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

            const offsetMinutes = profile.offset || 0;
            const userTime = DateTime.utc().plus({ minutes: offsetMinutes }).toFormat("h:mm a");

            const tierValue = interaction.options.getString(Options.tier, true);
            const server = interaction.options.getString(Options.server, true);
            const trybValue = interaction.options.getString(Options.tryb, true);
            const osoba = interaction.options.getUser(Options.osoba);

            const tier = TierDisplayNames[tierValue as keyof typeof TierDisplayNames];
            const tryb = TrybDisplayNames[trybValue as keyof typeof TrybDisplayNames] || "Zly tryb";

            let embedDescription = `> **IGN:** ${ign} | _${userTime}_ \n` +
                `> **Tier:** ${tier.name}   \n` +
                `> **Nazwa Serwera:** ${server}\n` +
                `> **Tryb:** ${tryb}\n\n`;

            // Add osoba to embed description if provided
            if (osoba) {
                embedDescription += `> **Osoba:** ${osoba.toString()}\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`${tier.name} Vouch Duel`)
                .setColor("#00d8ff")
                .setDescription(embedDescription)
                .setFooter({ text: "Czas +/- 10 min" });

            const button = new ButtonBuilder()
                .setCustomId("vduel_end")
                .setLabel("Zakończ Vouch Duel")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

            // Track the start time
            const startTime = Date.now();

            await interaction.editReply({ embeds: [embed], components: [row] });

            const filter = (i) => i.customId === "vduel_end" && i.user.id === interaction.user.id;
            if (interaction.channel) {
                const collector = interaction.channel.createMessageComponentCollector({
                    filter,
                    time: 60000, // 1 minute timeout
                });

                collector.on("collect", async (buttonInteraction) => {
                    try {
                        // Calculate elapsed time
                        const elapsedTimeMs = Date.now() - startTime;
                        const elapsedSeconds = Math.floor(elapsedTimeMs / 1000);
                        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                        const elapsedHours = Math.floor(elapsedMinutes / 60);

                        const elapsedTimeString = `${elapsedHours}h ${elapsedMinutes % 60}m ${elapsedSeconds % 60}s`;

                        // Update embed description to indicate the duel has ended with the elapsed time
                        embed.setDescription(
                            `${embedDescription}` + // Base description
                            `**Vouch duel skoniczony**\n` +
                            `**Czas trwania:** ${elapsedTimeString}`
                        );

                        await interaction.followUp({ embeds: [embed], components: [] });
                        collector.stop();
                    } catch (error) {
                        console.error("Error following up the message:", error);
                    }
                });

                collector.on("end", async () => {
                    try {
                        await interaction.followUp({ content: "Vouch duel sie skoniczyl.", components: [] });
                    } catch (error) {
                        console.error("Error on session end:", error);
                    }
                });
            }

        } catch (error) {
            console.error("Problemyyy:", error);
            return interaction.editReply({
                content: "Problem z czasem",
            });
        }
    }
});
