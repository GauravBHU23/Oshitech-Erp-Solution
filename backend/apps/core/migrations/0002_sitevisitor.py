from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="SiteVisitor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("visitor_hash", models.CharField(max_length=64, unique=True)),
                ("first_seen", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["first_seen"]},
        ),
    ]
