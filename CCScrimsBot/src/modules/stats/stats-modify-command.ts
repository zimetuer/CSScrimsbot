import { SlashCommand } from "lib";
import { SlashCommandBuilder } from "discord.js";
import { COUNCIL_PERMISSIONS } from "@Constants"; // Import the UserProfile schema

// Option identifiers
const Options = {
    typ: "typ",
    osoba: "osoba",
    dodajusun: "dodajusun"
};

// Main command
SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("zmien-staty")
        .setDescription("Zmien Statystyki graczy")
        .addStringOption((option) =>
            option
                .setName(Options.typ)
                .setDescription("Wybierz typ")
                .setRequired(true)
                .addChoices(
                    { name: "Wygrana", value: "wygrana" },
                    { name: "Przegrana", value: "przegrana" }
                )
        )
        .addStringOption((option) =>
            option
                .setName(Options.osoba)
                .setDescription("Wybierz osobe")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName(Options.dodajusun)
                .setDescription("Wybierz tryb")
                .setRequired(true)
                .addChoices(
                    { name: "Dodaj", value: "dodaj" },
                    { name: "Usun", value: "usun" }
                )
        )
        .setDefaultMemberPermissions("0")
        .setDMPermission(false),


    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Retrieve options from the command
        const osoba = interaction.options.getString(Options.osoba, true);
        const Typ = interaction.options.getString(Options.typ, true);
        const DodajUsun = interaction.options.getString(Options.dodajusun, true);
        
    }
});
