from django.db import migrations, models


class Migration(migrations.Migration):
    """Guardian name ki jagah father + mother name. Purana guardian_name data father_name me chala jata hai."""

    dependencies = [("students", "0004_issue_existing_id_cards")]

    operations = [
        migrations.RenameField(model_name="student", old_name="guardian_name", new_name="father_name"),
        migrations.AddField(
            model_name="student",
            name="mother_name",
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
