package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func Settings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.PublicSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

func AdminSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.AdminSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

func AdminSaveSettings(w http.ResponseWriter, r *http.Request) {
	var settings model.Settings
	_ = json.NewDecoder(r.Body).Decode(&settings)
	result, err := service.SaveSettings(settings)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
