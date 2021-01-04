$(document).ready(function () {
    // Row selection onclick logic
    $.each([$("#selectTableRowOnHover tr")], () => {
        $(this).hover( () => {
            console.log("adding selection");
            $(this).addClass("is-selected");
        }, () => {
            console.log("removing selected");
            $(this).removeClass("is-selected");
        });
    });
});

function closeModal() {
    $("#modal").removeClass("is-active");
}

function displayArtistTopTracks(roomName: string, artistId: number) {
    console.log(`Clicked on artist row with id=${artistId}`);
    // $(`#${artistId}`).first().addClass("is-selected");

    $("#modal").addClass("is-active");

    $("#addTrackDataId").empty();

    $.ajax({
        url: `/room/${roomName}/getArtistTopTracks/${artistId}`,
        method: "POST"
    }).done(function (data: any) {
        let finalGeneratedHtml = "";
        for (const track of data.topTrackData) {  // topTrackData comes from the '/:roomId/:artistId' POST in routes.js
            if (track == undefined) {
                console.log("WTF HAPPENED");
                console.log(data.topTrackData);
                return;
            }
            let generatedHtml = "<tr>";
            const addTrackUrl = `<td><a href="/${roomName}/add/${track.id}">+</a></td>`;
            const albumImage  = `<td><img src="${track.albumImage}" height="64" width="64"></img></td>`;
            const trackName   = `<td>${track.name}</td>`;
            const albumName   = `<td>${track.albumName}</td>`;
            const artistName  = `<td>${track.artistName}</td>`;
            const duration    = `<td>${track.duration_ms}</td>`;

            generatedHtml += addTrackUrl+albumImage+trackName+albumName+artistName+duration+"</tr>";
            finalGeneratedHtml += generatedHtml;
        }

        $("#addTrackDataId").append(finalGeneratedHtml);
    });
}
