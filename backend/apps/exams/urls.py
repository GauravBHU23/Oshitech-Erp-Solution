from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("exams", views.ExamViewSet, basename="exam")
router.register("schedules", views.ExamScheduleViewSet, basename="exam-schedule")
router.register("admit-cards", views.AdmitCardViewSet, basename="admit-card")
router.register("results", views.ResultViewSet, basename="result")

urlpatterns = [path("verify/<str:code>/", views.verify_admit_card)] + router.urls
