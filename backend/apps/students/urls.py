from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import IDCardViewSet, StudentViewSet, verify_id_card

router = DefaultRouter()
router.register("students", StudentViewSet, basename="student")
router.register("id-cards", IDCardViewSet, basename="id-card")
urlpatterns = [path("id-cards/verify/<str:code>/", verify_id_card, name="verify-id-card"), *router.urls]
